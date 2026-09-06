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
import { MealPlanEntry, PantryItem, Recipe } from '@/types';
import { nutritionService } from './nutritionService';
import { requireUserId } from './requireUserId';
import { recipeService } from './recipeService';

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

/** Higher = more urgent to cook soon, based on Prioritize/Use Soon pantry items it uses - same deterministic heuristic the mock planner used, now against real data. */
function recipeUrgency(recipe: Recipe, pantry: PantryItem[]): number {
  const pantryByIngredient = new Map(pantry.map((item) => [item.ingredientId, item]));
  return recipe.ingredients.reduce((score, ingredient) => {
    const pantryItem = pantryByIngredient.get(ingredient.ingredientId);
    if (!pantryItem) return score;
    if (pantryItem.freshness.label === 'prioritize') return score + 2;
    if (pantryItem.freshness.label === 'use_soon') return score + 1;
    return score;
  }, 0);
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

/**
 * Regenerates the week's dinners, front-loading recipes that use
 * Prioritize/Use Soon ingredients - clears only still-planned dinner entries
 * in this range first (never touches completed/skipped/cancelled history),
 * then creates one real meal_plan_items row per day.
 */
async function generateWeek(weekStart: string, weekEnd: string, timeZone: string): Promise<MealPlanEntry[]> {
  const userId = await requireUserId();
  const [recipes, pantry] = await Promise.all([recipeService.getRecipes(), fetchPantryItems(userId, timeZone)]);
  if (recipes.length === 0) {
    return fetchMealPlanEntries(userId, weekStart, weekEnd);
  }

  const ranked = [...recipes].sort(
    (a, b) => recipeUrgency(b, pantry) - recipeUrgency(a, pantry) || b.smartMatchScore - a.smartMatchScore,
  );

  await deletePlannedEntriesInRange(userId, 'dinner', weekStart, weekEnd);

  const dates = eachDateInRange(weekStart, weekEnd);
  const created = await Promise.all(
    dates.map((date, index) => {
      const recipe = ranked[index % ranked.length];
      return createMealPlanEntry(userId, {
        scheduledDate: date,
        timezone: timeZone,
        mealSlot: 'dinner',
        recipeVersionId: recipe.recipeVersionId ?? recipe.id,
        plannedServings: recipe.servings,
      });
    }),
  );

  return created;
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
