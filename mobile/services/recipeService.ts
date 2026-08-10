import { PantryItem, Recipe, RecipeCollectionId } from '@/types';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';

const COLLECTION_TITLES: Record<RecipeCollectionId, string> = {
  use_it_before_you_lose_it: 'Use It Before You Lose It',
  cook_right_now: 'Cook Right Now',
  almost_there: 'Almost There',
  quick_meals: 'Quick Meals',
  for_you: 'For You',
  something_different: 'Something Different',
};

export interface RecipeCollection {
  id: RecipeCollectionId;
  title: string;
  recipes: Recipe[];
}

/** Hydrates ingredient ownership against the live pantry - never stored statically. */
function hydrateRecipe(recipe: Recipe): Recipe {
  const pantryIngredientIds = new Set(db.pantry.map((item) => item.ingredientId));
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      isOwned: ingredient.isPantryStaple ? true : pantryIngredientIds.has(ingredient.ingredientId),
    })),
  };
}

export function getRecipeAvailability(recipe: Recipe): { owned: number; total: number } {
  const owned = recipe.ingredients.filter((i) => i.isOwned).length;
  return { owned, total: recipe.ingredients.length };
}

export function getMissingIngredients(recipe: Recipe) {
  return recipe.ingredients.filter((i) => !i.isOwned);
}

/** How many of this recipe's ingredients are pantry items flagged Prioritize or Use Soon. */
export function countIngredientsNeedingAttention(recipe: Recipe, pantry: PantryItem[]): number {
  const attentionIds = new Set(
    pantry
      .filter((item) => item.freshness.label === 'prioritize' || item.freshness.label === 'use_soon')
      .map((item) => item.ingredientId),
  );
  return recipe.ingredients.filter((i) => attentionIds.has(i.ingredientId)).length;
}

async function getRecipes(): Promise<Recipe[]> {
  await delay();
  return clone(db.recipes.map(hydrateRecipe));
}

async function getRecipeById(id: string): Promise<Recipe | null> {
  await delay(300);
  const recipe = db.recipes.find((r) => r.id === id);
  return recipe ? clone(hydrateRecipe(recipe)) : null;
}

async function getRecipeCollections(): Promise<RecipeCollection[]> {
  await delay();
  const hydrated = db.recipes.map(hydrateRecipe);
  return (Object.keys(COLLECTION_TITLES) as RecipeCollectionId[]).map((id) => ({
    id,
    title: COLLECTION_TITLES[id],
    recipes: clone(hydrated.filter((recipe) => recipe.collections.includes(id))),
  }));
}

/** Recipes the user could cook right now with zero shopping. */
async function countReadyToCookRecipes(): Promise<number> {
  await delay(200);
  return db.recipes.map(hydrateRecipe).filter((recipe) => getMissingIngredients(recipe).length === 0).length;
}

export const recipeService = {
  getRecipes,
  getRecipeById,
  getRecipeCollections,
  countReadyToCookRecipes,
};
