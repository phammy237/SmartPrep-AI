import { INGREDIENTS_BY_ID, normalizeIngredientName } from '@/data';
import {
  ExpiringLot,
  RecommendationCandidate,
  SmartRecipeRecommendation,
  UrgentIngredientDetail,
  allocateIngredientRequirementToLots,
  assessPantryItemExpiry,
  expiryStateRank,
  isUrgentExpiryState,
  rankRecommendations,
} from '@/lib/freshness';
import {
  fetchMealPlanEntries,
  fetchPantryItems,
  fetchRecipeVersions,
} from '@/lib/supabase/repositories';
import { MealPlanEntry, PantryItem, RecipeIngredient } from '@/types';
import { addDaysToIsoDate, todayIsoDateInTimeZone } from '@/utils/expiration';
import { nutritionService } from './nutritionService';
import { hydrateRecipe } from './recipeService';
import { requireUserId } from './requireUserId';

/** How far ahead the planner is consulted for "already planned" / "planned too late" context. */
export const RECOMMENDATION_PLANNER_WINDOW_DAYS = 7;

/** The default number of Use-Soon cards Home asks for. */
export const USE_SOON_DEFAULT_LIMIT = 4;

export interface GetUseSoonRecommendationsOptions {
  /** IANA zone the "today" boundary + expiry math are resolved in. Defaults to UTC (documented). */
  timeZone?: string;
  /** Max recommendations returned. Default 4. */
  limit?: number;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

interface ExpiringLotIndex {
  byId: Map<string, ExpiringLot[]>;
  byName: Map<string, ExpiringLot[]>;
}

/**
 * Group active, in-stock pantry lots by canonical ingredient id (and by
 * normalized name for the no-catalog-id fallback), carrying each lot's expiry
 * assessment. Mirrors lib/nutrition/pantryLots.ts's matching rules but keeps
 * the lot id + expiry that coverage math throws away.
 */
function buildExpiringLotIndex(pantry: PantryItem[], timeZone: string, now: Date): ExpiringLotIndex {
  const byId = new Map<string, ExpiringLot[]>();
  const byName = new Map<string, ExpiringLot[]>();
  const push = (m: Map<string, ExpiringLot[]>, k: string, lot: ExpiringLot) => {
    const a = m.get(k);
    if (a) a.push(lot);
    else m.set(k, [lot]);
  };

  for (const item of pantry) {
    if (item.status === 'depleted') continue;
    if (!(typeof item.quantity === 'number' && item.quantity > 0)) continue;
    const lot: ExpiringLot = {
      lotId: item.id,
      quantity: item.quantity,
      unit: item.unit,
      expiry: assessPantryItemExpiry(item, timeZone, now),
    };
    push(byId, item.ingredientId, lot);
    const nn = item.normalizedName ?? normalizeIngredientName(item.name);
    if (nn) push(byName, nn, lot);
  }
  return { byId, byName };
}

/** Canonical id first; exact normalized-name fallback only when the ingredient has no catalog id. Never fuzzy. */
function lotsForRecipeIngredient(ingredient: RecipeIngredient, index: ExpiringLotIndex): ExpiringLot[] {
  const byId = index.byId.get(ingredient.ingredientId);
  if (byId && byId.length > 0) return byId;
  if (!INGREDIENTS_BY_ID[ingredient.ingredientId]) {
    return index.byName.get(normalizeIngredientName(ingredient.name)) ?? [];
  }
  return [];
}

function worstLot(lots: ExpiringLot[]): ExpiringLot {
  return [...lots].sort((a, b) => {
    const r = expiryStateRank(a.expiry.state) - expiryStateRank(b.expiry.state);
    if (r !== 0) return r;
    return a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0;
  })[0];
}

/**
 * Deterministic "Use Soon" recipe recommendations - what to cook to use food
 * before it's wasted.
 *
 * Reads only (pantry, recipe catalog, near-term planner). Never writes.
 * One bulk pass: recipes + pantry fetched once, conversion metadata loaded
 * once, no per-item recipe fetch. The planner is a SOFT dependency - a planner
 * failure degrades gracefully to "no planner context", it does not fail the
 * recommendations.
 */
async function getUseSoonRecommendations(
  opts: GetUseSoonRecommendationsOptions = {},
): Promise<SmartRecipeRecommendation[]> {
  const userId = await requireUserId();
  const timeZone = opts.timeZone ?? 'UTC';
  const limit = opts.limit ?? USE_SOON_DEFAULT_LIMIT;
  const now = opts.now ?? new Date();
  const today = todayIsoDateInTimeZone(timeZone, now);
  const windowEnd = addDaysToIsoDate(today, RECOMMENDATION_PLANNER_WINDOW_DAYS);

  const [recipesRaw, pantry] = await Promise.all([
    fetchRecipeVersions(),
    fetchPantryItems(userId, timeZone),
  ]);

  const plannedEntries: MealPlanEntry[] = await fetchMealPlanEntries(userId, today, windowEnd).catch(
    () => [] as MealPlanEntry[],
  );

  const ingredientIds = Array.from(
    new Set(recipesRaw.flatMap((r) => r.ingredients.map((i) => i.ingredientId))),
  );
  const conversionMeta = await nutritionService.getConversionMetaMap(ingredientIds);

  const recipes = recipesRaw.map((r) => hydrateRecipe(r, pantry, conversionMeta));
  const lotIndex = buildExpiringLotIndex(pantry, timeZone, now);

  // Nearest upcoming planned date per recipe version, within the window.
  const plannedByRecipe = new Map<string, string>();
  for (const e of plannedEntries) {
    if (e.status !== 'planned') continue;
    if (e.scheduledDate < today || e.scheduledDate > windowEnd) continue;
    const cur = plannedByRecipe.get(e.recipeVersionId);
    if (!cur || e.scheduledDate < cur) plannedByRecipe.set(e.recipeVersionId, e.scheduledDate);
  }

  const candidates: RecommendationCandidate[] = recipes.map((recipe) => {
    const recipeVersionId = recipe.recipeVersionId ?? recipe.id;
    const nonStaple = recipe.ingredients.filter((i) => !i.isPantryStaple);
    const coveredCount = nonStaple.filter((i) => i.coverage?.status === 'covered').length;
    const totalCount = nonStaple.length;
    const missingIngredientCount = nonStaple.filter((i) => i.coverage?.status === 'missing').length;

    const urgentIngredients: UrgentIngredientDetail[] = [];
    for (const ing of nonStaple) {
      const lots = lotsForRecipeIngredient(ing, lotIndex);
      if (lots.length === 0 || !lots.some((l) => isUrgentExpiryState(l.expiry.state))) continue;

      const alloc = allocateIngredientRequirementToLots(
        ing.quantity,
        ing.unit,
        lots,
        conversionMeta.get(ing.ingredientId),
      );
      // Count it only if the recipe would actually consume at-risk stock, OR
      // the units couldn't be compared (identity match to an urgent lot).
      if (alloc.urgentQuantityUtilized <= 0 && !alloc.quantityUnresolved) continue;

      const worst = worstLot(lots);
      urgentIngredients.push({
        ingredientId: ing.ingredientId,
        name: ing.name,
        expiryState: worst.expiry.state,
        expirationDate: worst.expiry.expirationDate,
        daysUntilExpiry: worst.expiry.daysUntilExpiry ?? undefined,
        isUserConfirmedDate: worst.expiry.isUserConfirmedDate,
        quantityUtilized: alloc.quantityUnresolved ? undefined : alloc.urgentQuantityUtilized,
        unit: alloc.quantityUnresolved ? undefined : alloc.coveredUnit,
        quantityUnresolved: alloc.quantityUnresolved,
      });
    }

    const plannedDate = plannedByRecipe.get(recipeVersionId);
    const plannedAfterExpiryWarning =
      !!plannedDate &&
      urgentIngredients.some((u) => u.expirationDate !== undefined && u.expirationDate < plannedDate);

    return {
      recipeId: recipe.id,
      recipeVersionId,
      title: recipe.title,
      imageUri: recipe.imageUri,
      coveredCount,
      totalCount,
      missingIngredientCount,
      urgentIngredients,
      plannedDate,
      plannedAfterExpiryWarning,
    };
  });

  return rankRecommendations(candidates, { today }).slice(0, limit);
}

export const recommendationService = {
  getUseSoonRecommendations,
};
