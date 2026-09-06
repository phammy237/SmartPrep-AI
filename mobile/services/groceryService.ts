import { INGREDIENTS_BY_ID } from '@/data';
import {
  InsertGroceryItemParams,
  deleteCheckedGroceryListItems,
  deleteGroceryListItem,
  fetchActiveGroceryList,
  fetchGroceryListItems,
  fetchOrCreateActiveGroceryList,
  insertGroceryListItem,
  insertGroceryListItems,
  toggleGroceryListItemChecked,
  updateGroceryListItem,
} from '@/lib/supabase/repositories';
import { AddGroceryItemInput, UpdateGroceryItemInput, addGroceryItemSchema, updateGroceryItemSchema } from '@/lib/validation/grocerySchemas';
import { GroceryList, GroceryListItem, RecipeIngredient } from '@/types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
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

/**
 * Adds a recipe's not-owned ingredients to the active grocery list, persisted
 * in Supabase.
 *
 * `missingIngredients` is computed upstream by `recipeService.getMissingIngredients`
 * (recipe ingredients whose id isn't in the live pantry and aren't pantry
 * staples). That calculation is preserved exactly: because a "missing"
 * ingredient has NO pantry presence at all, its uncovered amount IS the full
 * recipe requirement, so each line is stored with `quantityBasis =
 * 'recipe_requirement'`. A true `uncovered_shortfall` (recipe demand minus a
 * partial pantry quantity) needs unit conversion the app doesn't have yet.
 *
 * Merge rule: if the same ingredient is already on the list as an unchecked
 * `recipe_requirement` line **with the exact same unit**, the quantities are
 * summed and the recipe id is appended. A unit mismatch (or a manual line, or
 * an already-checked line) is never merged - it lands as its own line. Units
 * are never silently converted.
 */
async function addMissingIngredientsForRecipe(
  recipeVersionId: string,
  missingIngredients: RecipeIngredient[],
): Promise<GroceryListItem[]> {
  const userId = await requireUserId();
  const list = await fetchOrCreateActiveGroceryList();
  const current = await fetchGroceryListItems(list.id);

  const updatedItems: GroceryListItem[] = [];
  const toInsert: InsertGroceryItemParams[] = [];

  for (const ingredient of missingIngredients) {
    const match = current.find(
      (item) =>
        !item.isChecked &&
        item.quantityBasis === 'recipe_requirement' &&
        item.unit === ingredient.unit &&
        (item.ingredientId
          ? item.ingredientId === ingredient.ingredientId
          : item.name.toLowerCase() === ingredient.name.toLowerCase()),
    );

    if (match) {
      const mergedRecipeIds = Array.from(new Set([...(match.sourceRecipeIds ?? []), recipeVersionId]));
      const row = await updateGroceryListItem(match.id, {
        quantity: match.quantity + ingredient.quantity,
        sourceRecipeVersionIds: mergedRecipeIds,
      });
      updatedItems.push(row);
      // Keep the in-memory view current so two missing ingredients that
      // resolve to the same line in one call both fold in.
      match.quantity = row.quantity;
      match.sourceRecipeIds = mergedRecipeIds;
    } else {
      toInsert.push({
        catalogIngredientId: ingredient.ingredientId,
        displayName: ingredient.name,
        imageUri: ingredient.imageUri,
        category: INGREDIENTS_BY_ID[ingredient.ingredientId]?.category ?? null,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        source: 'recipe',
        sourceRecipeVersionIds: [recipeVersionId],
        quantityBasis: 'recipe_requirement',
      });
    }
  }

  const inserted = toInsert.length > 0 ? await insertGroceryListItems(userId, list.id, toInsert) : [];
  return [...updatedItems, ...inserted];
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
  addMissingIngredientsForRecipe,
};
