import { generatePlan } from '@/lib/planner';
import {
  PlanDemandContribution,
  PlanGroceryDemandIngredientInput,
  PlanWeekGroceryDemand,
  computePlanGroceryDemand,
  planGenerationKey,
} from '@/lib/nutrition/planDemand';
import { indexPantryLots, lotsForIngredient } from '@/lib/nutrition/pantryLots';
import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  deletePlannedEntriesInRange,
  fetchMealPlanEntries,
  fetchPantryItems,
  fetchRecipeVersions,
  updateMealPlanEntry,
} from '@/lib/supabase/repositories';
import { CreateMealPlanEntryInput, UpdateMealPlanEntryInput } from '@/lib/validation/plannerSchemas';
import { MealPlanEntry, Recipe } from '@/types';
import { todayIsoDateInTimeZone } from '@/utils/expiration';
import { nutritionService } from './nutritionService';
import { hydrateRecipe } from './recipeService';
import { requireUserId } from './requireUserId';

async function getMealPlanForWeek(weekStart: string, weekEnd: string): Promise<MealPlanEntry[]> {
  const userId = await requireUserId();
  return fetchMealPlanEntries(userId, weekStart, weekEnd);
}

async function addMealPlanEntry(input: CreateMealPlanEntryInput): Promise<MealPlanEntry> {
  const userId = await requireUserId();
  return createMealPlanEntry(userId, input);
}

/** Marking an entry 'completed'/'skipped'/'cancelled' is a plain status write - it never creates a meal log. */
async function updatePlanEntry(id: string, patch: UpdateMealPlanEntryInput): Promise<MealPlanEntry> {
  return updateMealPlanEntry(id, patch);
}

async function removeMealPlanEntry(id: string): Promise<void> {
  return deleteMealPlanEntry(id);
}

function eachDateInRange(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const endTime = new Date(`${endDate}T00:00:00Z`).getTime();
  const dates: string[] = [];
  while (cursor.getTime() <= endTime) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Service-facing summary of a generated week. No raw ranking scores are exposed. */
export interface GenerateWeekSummary {
  /** Distinct urgent pantry ingredients the generated week draws on. */
  urgentIngredientCount: number;
  /** How many of the generated dinners target expiring stock. */
  recipesUsingUrgentStock: number;
  /** Rough grocery burden: Σ of non-staple ingredients with no matching stock across the generated dinners. */
  estimatedShortfallCount: number;
  /** An urgent ingredient's tracked date falls before the day its recipe was scheduled - no arrangement fixed it. */
  expiryWarnings: { ingredientName: string; expirationDate: string; plannedDate: string }[];
}

export interface GenerateWeekResult {
  entries: MealPlanEntry[];
  summary: GenerateWeekSummary;
}

const EMPTY_SUMMARY: GenerateWeekSummary = {
  urgentIngredientCount: 0,
  recipesUsingUrgentStock: 0,
  estimatedShortfallCount: 0,
  expiryWarnings: [],
};

/**
 * Regenerates the week's dinners using the deterministic Smart Expiry / Use
 * Soon engine: recipes are scored (via the SAME `scoreRecommendationCandidate`
 * that powers Home "Use Soon") against a generation-time VIRTUAL pantry, one
 * day at a time, earliest first. Each pick virtually consumes its FEFO lot
 * allocation so the next day ranks against what's left (no double-counting the
 * same stock across the week). Real `pantry_items` are never touched.
 *
 * Preserved from the previous implementation: only still-`planned` dinner
 * entries in the range are cleared first (completed/skipped/cancelled history
 * is untouched); exactly one dinner per day; `plannedServings = recipe.servings`;
 * an empty recipe catalog is a no-op that returns the existing entries;
 * fully deterministic for a given pantry / catalog / date / timezone.
 */
async function generateWeek(
  weekStart: string,
  weekEnd: string,
  timeZone: string,
): Promise<GenerateWeekResult> {
  const userId = await requireUserId();
  const now = new Date();
  const today = todayIsoDateInTimeZone(timeZone, now);

  const [recipesRaw, pantry] = await Promise.all([
    fetchRecipeVersions(),
    fetchPantryItems(userId, timeZone),
  ]);
  const dates = eachDateInRange(weekStart, weekEnd);

  if (recipesRaw.length === 0 || dates.length === 0) {
    const entries = await fetchMealPlanEntries(userId, weekStart, weekEnd);
    return { entries, summary: EMPTY_SUMMARY };
  }

  const ingredientIds = Array.from(
    new Set(recipesRaw.flatMap((r) => r.ingredients.map((i) => i.ingredientId))),
  );
  const conversionMeta = await nutritionService.getConversionMetaMap(ingredientIds);
  const recipes = recipesRaw.map((r) => hydrateRecipe(r, pantry, conversionMeta));

  const plan = generatePlan({ dates, today, timeZone, now, recipes, pantry, conversionMeta });

  await deletePlannedEntriesInRange(userId, 'dinner', weekStart, weekEnd);
  const entries = await Promise.all(
    plan.slots.map((s) =>
      createMealPlanEntry(userId, {
        scheduledDate: s.date,
        timezone: timeZone,
        mealSlot: 'dinner',
        recipeVersionId: s.recipeVersionId,
        plannedServings: s.plannedServings,
      }),
    ),
  );

  return {
    entries,
    summary: {
      urgentIngredientCount: plan.urgentIngredientsTargeted.length,
      recipesUsingUrgentStock: plan.recipesUsingUrgentStock,
      estimatedShortfallCount: plan.estimatedShortfallCount,
      expiryWarnings: plan.warnings.map((w) => ({
        ingredientName: w.ingredientName,
        expirationDate: w.expirationDate,
        plannedDate: w.plannedDate,
      })),
    },
  };
}

/**
 * Whole-week grocery demand: every PLANNED entry's recipe requirements,
 * servings-scaled, aggregated per canonical ingredient, then compared against
 * the live pantry ONCE (see lib/nutrition/planDemand.ts for why "once"
 * matters). Read-only - persistence is groceryService.applyPlanGroceryDemand.
 *
 * Only `status = 'planned'` entries count: a completed meal is already cooked,
 * and skipped/cancelled ones will not be. Demand for each recipe is scaled by
 * `plannedServings / recipe.servings` so planning 8 servings of a 4-serving
 * recipe asks for 2x the ingredients.
 */
async function getPlanGroceryDemand(
  weekStart: string,
  weekEnd: string,
  timeZone: string,
): Promise<PlanWeekGroceryDemand> {
  const userId = await requireUserId();
  const [entries, recipes, pantry] = await Promise.all([
    fetchMealPlanEntries(userId, weekStart, weekEnd),
    fetchRecipeVersions(),
    fetchPantryItems(userId, timeZone),
  ]);

  const planned = entries.filter((e) => e.status === 'planned');
  const recipeByVersion = new Map<string, Recipe>(recipes.map((r) => [r.recipeVersionId ?? r.id, r]));

  // canonical ingredient id -> aggregated contributions + display info
  const perIngredient = new Map<
    string,
    { name: string; imageUri: string; contributions: PlanDemandContribution[] }
  >();
  let unresolvedRecipeCount = 0;

  for (const entry of planned) {
    const recipe = recipeByVersion.get(entry.recipeVersionId);
    if (!recipe) {
      unresolvedRecipeCount += 1;
      continue;
    }
    const factor = recipe.servings > 0 ? entry.plannedServings / recipe.servings : 1;
    for (const ing of recipe.ingredients) {
      const bucket = perIngredient.get(ing.ingredientId) ?? {
        name: ing.name,
        imageUri: ing.imageUri,
        contributions: [],
      };
      bucket.contributions.push({
        recipeVersionId: recipe.recipeVersionId ?? recipe.id,
        quantity: ing.quantity * factor,
        unit: ing.unit,
        isPantryStaple: ing.isPantryStaple ?? false,
      });
      perIngredient.set(ing.ingredientId, bucket);
    }
  }

  const ids = [...perIngredient.keys()];
  const conversionMeta = await nutritionService.getConversionMetaMap(ids);
  const lotIndex = indexPantryLots(pantry);

  const ingredientInputs: PlanGroceryDemandIngredientInput[] = ids.map((id) => {
    const bucket = perIngredient.get(id)!;
    return {
      ingredientId: id,
      name: bucket.name,
      imageUri: bucket.imageUri,
      contributions: bucket.contributions,
      lots: lotsForIngredient({ ingredientId: id, name: bucket.name }, lotIndex),
      conversionMeta: conversionMeta.get(id),
    };
  });

  return {
    planGenerationKey: planGenerationKey(weekStart, weekEnd),
    weekStart,
    weekEnd,
    plannedRecipeCount: planned.length - unresolvedRecipeCount,
    unresolvedRecipeCount,
    demand: computePlanGroceryDemand({ ingredients: ingredientInputs }),
  };
}

export const plannerService = {
  getMealPlanForWeek,
  addMealPlanEntry,
  updateMealPlanEntry: updatePlanEntry,
  removeMealPlanEntry,
  generateWeek,
  getPlanGroceryDemand,
};
