import { getIngredient } from '@/data';
import { GroceryList, GroceryListItem, IngredientCategory, QuantityUnit } from '@/types';
import { generateId } from '@/utils/id';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';
import { getMissingIngredients } from './recipeService';

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

/** Adds a recipe's missing (non-staple) ingredients to the grocery list, skipping ones already listed. */
async function addMissingIngredientsForRecipe(recipeId: string): Promise<GroceryListItem[]> {
  await delay(400);
  const recipe = db.recipes.find((r) => r.id === recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  // Recompute ownership the same way recipeService does, without a circular import.
  const pantryIngredientIds = new Set(db.pantry.map((item) => item.ingredientId));
  const hydrated = {
    ...recipe,
    ingredients: recipe.ingredients.map((i) => ({
      ...i,
      isOwned: i.isPantryStaple ? true : pantryIngredientIds.has(i.ingredientId),
    })),
  };

  const existingIds = new Set(db.groceryList.items.map((i) => i.ingredientId).filter(Boolean));
  const missing = getMissingIngredients(hydrated).filter((i) => !existingIds.has(i.ingredientId));

  const added: GroceryListItem[] = missing.map((ingredient) => ({
    id: generateId('grocery-item'),
    ingredientId: ingredient.ingredientId,
    name: ingredient.name,
    imageUri: ingredient.imageUri,
    category: getIngredient(ingredient.ingredientId).category,
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
