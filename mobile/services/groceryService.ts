import { INGREDIENTS_BY_ID } from '@/data';
import { GroceryList, GroceryListItem, IngredientCategory, QuantityUnit, RecipeIngredient } from '@/types';
import { generateId } from '@/utils/id';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';

export interface ManualGroceryItemInput {
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
}

async function getGroceryList(): Promise<GroceryList> {
  await delay();
  return clone(db.groceryList);
}

async function toggleGroceryItem(id: string): Promise<GroceryListItem> {
  await delay(200);
  const item = db.groceryList.items.find((i) => i.id === id);
  if (!item) throw new Error(`Grocery item ${id} not found`);
  item.isChecked = !item.isChecked;
  return clone(item);
}

async function addGroceryItem(input: ManualGroceryItemInput): Promise<GroceryListItem> {
  await delay(300);
  const itemId = generateId('grocery-item');
  const item: GroceryListItem = {
    id: itemId,
    name: input.name,
    imageUri: ingredientPhotoUri(itemId, input.name),
    category: input.category,
    quantity: input.quantity,
    unit: input.unit,
    isChecked: false,
    isManuallyAdded: true,
  };
  db.groceryList.items = [...db.groceryList.items, item];
  return clone(item);
}

async function removeGroceryItem(id: string): Promise<void> {
  await delay(250);
  db.groceryList.items = db.groceryList.items.filter((i) => i.id !== id);
}

/**
 * Adds the given (already-hydrated, already-filtered-to-missing) recipe
 * ingredients to the grocery list, skipping ones already listed.
 *
 * Takes the ingredient list directly from the caller - RecipeDetailScreen
 * already computes it via recipeService.getMissingIngredients - instead of
 * looking a recipe up by id in the mock db.recipes array. Real (Phase 3)
 * recipes live in a different id space than the legacy mock catalog, so a
 * lookup here would silently fail for every real recipe; grocery itself
 * stays fully mock (out of Phase 3 scope), this is the minimal decoupling
 * needed to avoid that regression.
 */
async function addMissingIngredientsForRecipe(recipeId: string, missingIngredients: RecipeIngredient[]): Promise<GroceryListItem[]> {
  await delay(400);

  const existingIds = new Set(db.groceryList.items.map((i) => i.ingredientId).filter(Boolean));
  const missing = missingIngredients.filter((i) => !existingIds.has(i.ingredientId));

  const added: GroceryListItem[] = missing.map((ingredient) => ({
    id: generateId('grocery-item'),
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    imageUri: ingredient.imageUri,
    // Falls back to 'other' for an ingredient with no catalog match (every
    // Phase 3 seeded ingredient has one, so this only guards a future gap).
    category: INGREDIENTS_BY_ID[ingredient.ingredientId]?.category ?? 'other',
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    isChecked: false,
    sourceRecipeIds: [recipeId],
  }));

  db.groceryList.items = [...db.groceryList.items, ...added];
  return clone(added);
}

export const groceryService = {
  getGroceryList,
  toggleGroceryItem,
  addGroceryItem,
  removeGroceryItem,
  addMissingIngredientsForRecipe,
};
