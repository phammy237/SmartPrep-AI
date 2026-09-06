import { INGREDIENTS_BY_ID } from '@/data';
import { shortfallLineFor } from '@/lib/nutrition/pantryCoverage';
import { PlanWeekGroceryDemand } from '@/lib/nutrition/planDemand';
import { normalizeUnit } from '@/lib/nutrition/units';
import {
  InsertGroceryItemParams,
  deleteCheckedGroceryListItems,
  deleteGroceryListItem,
  deletePlanGeneratedGroceryItems,
  fetchActiveGroceryList,
  fetchGroceryListItems,
  fetchOrCreateActiveGroceryList,
  insertGroceryListItem,
  insertGroceryListItems,
  toggleGroceryListItemChecked,
  updateGroceryListItem,
} from '@/lib/supabase/repositories';
import { AddGroceryItemInput, UpdateGroceryItemInput, addGroceryItemSchema, updateGroceryItemSchema } from '@/lib/validation/grocerySchemas';
import { GroceryList, GroceryListItem, QuantityUnit } from '@/types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { nutritionService } from './nutritionService';
import type { RecipeShortfall } from './recipeService';
import { requireUserId } from './requireUserId';

/** Kept name for backwards-compatible imports (AddGroceryItemModal, useGrocery). */
export type ManualGroceryItemInput = AddGroceryItemInput;
export type { UpdateGroceryItemInput };

async function getGroceryList(): Promise<GroceryList> {
  await requireUserId();
  return fetchActiveGroceryList();
}

async function addGroceryItem(input: ManualGroceryItemInput): Promise<GroceryListItem> {
  const userId = await requireUserId();
  const parsed = addGroceryItemSchema.parse(input);
  const list = await fetchOrCreateActiveGroceryList();
  return insertGroceryListItem(userId, list.id, {
    displayName: parsed.name,
    imageUri: ingredientPhotoUri(`grocery-${parsed.name}`, parsed.name),
    category: parsed.category,
    quantity: parsed.quantity,
    unit: parsed.unit,
    source: 'manual',
    quantityBasis: 'as_entered',
  });
}

/**
 * Edit an existing line. Backend capability - no UI affordance today, but the
 * pattern (screen/hook -> service -> repository) is in place and tested.
 */
async function updateGroceryItem(id: string, patch: UpdateGroceryItemInput): Promise<GroceryListItem> {
  await requireUserId();
  const parsed = updateGroceryItemSchema.parse(patch);
  return updateGroceryListItem(id, parsed);
}

/** Flip acquired/not-acquired. Does NOT touch the pantry - see the module note below. */
async function toggleGroceryItem(id: string): Promise<GroceryListItem> {
  await requireUserId();
  return toggleGroceryListItemChecked(id);
}

async function removeGroceryItem(id: string): Promise<void> {
  await requireUserId();
  return deleteGroceryListItem(id);
}

/** Remove every checked ("acquired") item from the active list. */
async function clearCheckedItems(): Promise<void> {
  await requireUserId();
  const list = await fetchOrCreateActiveGroceryList();
  return deleteCheckedGroceryListItems(list.id);
}

const GROCERY_UNITS = new Set<QuantityUnit>([
  'item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L',
]);

/** Map a canonical unit key ('l', 'g', ...) to a stored grocery unit ('L', 'g', ...), or null if it isn't one. */
function toGroceryUnit(unit: string): QuantityUnit | null {
  const mapped = unit === 'l' ? 'L' : unit;
  return GROCERY_UNITS.has(mapped as QuantityUnit) ? (mapped as QuantityUnit) : null;
}

/**
 * Adds a recipe's uncovered ingredient demand to the active grocery list,
 * driven by quantity-aware coverage (`recipeService.getRecipeShortfalls`):
 *
 *   coverage 'missing'    -> a `recipe_requirement` line for the full amount
 *   coverage 'partial'    -> an `uncovered_shortfall` line for just the gap,
 *                            in the recipe's own unit when the shortfall
 *                            converts back deterministically, else in grams
 *   coverage 'unresolved' -> a conservative `recipe_requirement` line for the
 *                            full amount (never a silent subtraction), tagged
 *                            in source_metadata with the reason
 *
 * Merge rule: an existing UNCHECKED, generated line (source recipe/meal_plan)
 * for the same canonical ingredient, same stored unit, AND same
 * `quantity_basis` is summed and gains the new recipe id. Different unit or
 * different basis (requirement vs shortfall) never merge; manual and checked
 * lines are never touched. All conversion goes through the shared engine -
 * grocery does no unit math of its own.
 */
async function addRecipeShortfallsToGroceryList(
  recipeVersionId: string,
  shortfalls: RecipeShortfall[],
): Promise<GroceryListItem[]> {
  const userId = await requireUserId();
  const list = await fetchOrCreateActiveGroceryList();
  const [current, metaMap] = await Promise.all([
    fetchGroceryListItems(list.id),
    nutritionService.getConversionMetaMap(shortfalls.map((s) => s.ingredient.ingredientId)),
  ]);

  const updatedItems: GroceryListItem[] = [];
  const toInsert: InsertGroceryItemParams[] = [];

  for (const { ingredient, coverage } of shortfalls) {
    const meta = metaMap.get(ingredient.ingredientId);
    const line = shortfallLineFor(coverage, meta);
    if (!line) continue; // fully covered - nothing to buy

    let storedUnit = toGroceryUnit(line.unit);
    let quantity = line.quantity;
    let quantityBasis = line.quantityBasis;
    let metadata: Record<string, unknown> = line.metadata;
    if (!storedUnit) {
      // A derived unit the grocery schema can't store - fall back to a
      // conservative full-requirement line in the recipe's own unit.
      storedUnit = toGroceryUnit(ingredient.unit) ?? 'item';
      quantity = ingredient.quantity;
      quantityBasis = 'recipe_requirement';
      metadata = { ...metadata, unitFallback: line.unit };
    }

    const match = current.find(
      (item) =>
        !item.isChecked &&
        // Recipe-detail adds merge only into other recipe-detail lines. Plan-
        // generated ('meal_plan') lines are owned by their planGenerationKey and
        // reconciled as a set - cross-merging would break "Add Week" idempotency.
        item.source === 'recipe' &&
        item.quantityBasis === quantityBasis &&
        (toGroceryUnit(normalizeUnit(item.unit) ?? item.unit) ?? item.unit) === storedUnit &&
        (item.ingredientId
          ? item.ingredientId === ingredient.ingredientId
          : item.name.toLowerCase() === ingredient.name.toLowerCase()),
    );

    if (match) {
      const mergedRecipeIds = Array.from(new Set([...(match.sourceRecipeIds ?? []), recipeVersionId]));
      const row = await updateGroceryListItem(match.id, {
        quantity: match.quantity + quantity,
        sourceRecipeVersionIds: mergedRecipeIds,
      });
      updatedItems.push(row);
      match.quantity = row.quantity;
      match.sourceRecipeIds = mergedRecipeIds;
      continue;
    }

    // Fold into a pending insert from earlier in this same call (e.g. a recipe
    // that lists the same ingredient twice) rather than creating two rows.
    const pending = toInsert.find(
      (p) =>
        p.catalogIngredientId === ingredient.ingredientId &&
        p.unit === storedUnit &&
        p.quantityBasis === quantityBasis,
    );
    if (pending) {
      pending.quantity += quantity;
      continue;
    }

    toInsert.push({
      catalogIngredientId: ingredient.ingredientId,
      displayName: ingredient.name,
      imageUri: ingredient.imageUri,
      category: INGREDIENTS_BY_ID[ingredient.ingredientId]?.category ?? null,
      quantity,
      unit: storedUnit,
      source: 'recipe',
      sourceRecipeVersionIds: [recipeVersionId],
      quantityBasis,
      sourceMetadata: metadata,
    });
  }

  const inserted = toInsert.length > 0 ? await insertGroceryListItems(userId, list.id, toInsert) : [];
  return [...updatedItems, ...inserted];
}

export interface ApplyPlanGroceryResult {
  /** Lines inserted for this run. */
  addedCount: number;
  /** Stale plan lines from a previous run of the SAME plan key that were replaced. */
  removedPriorCount: number;
  /** Inserted lines whose pantry comparison was unresolved (conservative full requirement). */
  unresolvedCount: number;
  /** True when the plan needs nothing bought (pantry covers it) and there was nothing stale to clear. */
  nothingNeeded: boolean;
  items: GroceryListItem[];
}

/**
 * Persists whole-week plan demand (from `plannerService.getPlanGroceryDemand`)
 * to the active grocery list, reusing the SAME coverage->line mapping
 * (`shortfallLineFor`) and unit rules as the recipe-detail flow.
 *
 * Idempotent by reconciliation: every run first deletes this plan key's own
 * still-unchecked generated lines, then re-inserts the freshly computed set.
 * Tapping "Add Week" twice, a screen remount, or a retry after a partial write
 * all converge to the same lines - never doubled demand. Manual lines, checked
 * lines, recipe-detail lines, and other weeks' plan lines are never touched.
 *
 *   partial coverage  -> `uncovered_shortfall` line for the gap
 *   missing / unresolved -> conservative `recipe_requirement` line (never a
 *                           silent subtraction, never "pantry has zero")
 * Every line carries `source = 'meal_plan'`, all contributing recipe version
 * ids, and `planGenerationKey` in `source_metadata`.
 */
async function applyPlanGroceryDemand(plan: PlanWeekGroceryDemand): Promise<ApplyPlanGroceryResult> {
  const userId = await requireUserId();
  const list = await fetchOrCreateActiveGroceryList();

  const metaMap = await nutritionService.getConversionMetaMap(
    plan.demand.ingredients.map((i) => i.ingredientId),
  );
  const removedPriorCount = await deletePlanGeneratedGroceryItems(list.id, plan.planGenerationKey);

  const toInsert: InsertGroceryItemParams[] = [];
  let unresolvedCount = 0;

  for (const ingredient of plan.demand.ingredients) {
    const meta = metaMap.get(ingredient.ingredientId);
    for (const segment of ingredient.segments) {
      const line = shortfallLineFor(segment.coverage, meta);
      if (!line) continue; // covered - nothing to buy

      let storedUnit = toGroceryUnit(line.unit);
      let quantity = line.quantity;
      let quantityBasis = line.quantityBasis;
      let metadata: Record<string, unknown> = {
        planGenerationKey: plan.planGenerationKey,
        weekStart: plan.weekStart,
        weekEnd: plan.weekEnd,
        ...line.metadata,
      };
      if (!storedUnit) {
        storedUnit = toGroceryUnit(segment.requirement.unit) ?? 'item';
        quantity = segment.requirement.quantity;
        quantityBasis = 'recipe_requirement';
        metadata = { ...metadata, unitFallback: line.unit };
      }
      if (metadata.coverage === 'unresolved') unresolvedCount += 1;

      // Fold segments that map to the same (ingredient, unit, basis) into one line.
      const pending = toInsert.find(
        (p) =>
          p.catalogIngredientId === ingredient.ingredientId &&
          p.unit === storedUnit &&
          p.quantityBasis === quantityBasis,
      );
      if (pending) {
        pending.quantity += quantity;
        pending.sourceRecipeVersionIds = Array.from(
          new Set([...(pending.sourceRecipeVersionIds ?? []), ...segment.contributingRecipeVersionIds]),
        );
        continue;
      }

      toInsert.push({
        catalogIngredientId: ingredient.ingredientId,
        displayName: ingredient.name,
        imageUri: ingredient.imageUri,
        category: INGREDIENTS_BY_ID[ingredient.ingredientId]?.category ?? null,
        quantity,
        unit: storedUnit,
        source: 'meal_plan',
        sourceRecipeVersionIds: segment.contributingRecipeVersionIds,
        quantityBasis,
        sourceMetadata: metadata,
      });
    }
  }

  const items = toInsert.length > 0 ? await insertGroceryListItems(userId, list.id, toInsert) : [];
  return {
    addedCount: items.length,
    removedPriorCount,
    unresolvedCount,
    nothingNeeded: items.length === 0 && removedPriorCount === 0,
    items,
  };
}

/**
 * Grocery <-> pantry boundary: checking a grocery item means "acquired /
 * done", NOT "now in my pantry". Nothing in this service reads or writes
 * pantry_items / pantry_events. The previous mock service did not cross this
 * line either, so there is no implicit pantry mutation to remove - an
 * explicit "add purchased items to pantry" flow is future work.
 */
export const groceryService = {
  getGroceryList,
  addGroceryItem,
  updateGroceryItem,
  toggleGroceryItem,
  removeGroceryItem,
  clearCheckedItems,
  addRecipeShortfallsToGroceryList,
  applyPlanGroceryDemand,
};
