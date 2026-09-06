import {
  fetchRecipeVersionById,
  fetchRecipeVersions,
  fetchSavedRecipes,
  saveRecipe as saveRecipeRow,
  unsaveRecipe as unsaveRecipeRow,
} from '@/lib/supabase/repositories';
import { fetchPantryItems } from '@/lib/supabase/repositories';
import { PantryItem, Recipe, RecipeCollectionId, SavedRecipe } from '@/types';
import { requireUserId } from './requireUserId';

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

function computeMatchScore(owned: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((owned / total) * 100);
}

/**
 * Hydrates ingredient ownership against the live pantry and derives
 * smartMatchScore from that same live overlap - computed here on every
 * read, never stored, never learned. Matching is by ingredientId: for
 * catalog-based ingredients (scan/grocery-sourced pantry items) this is a
 * real catalog id; manually-added pantry items carry a synthetic id and
 * simply won't match unless the recipe ingredient also lacks a catalog
 * mapping, same limitation the mock version always had.
 */
function hydrateRecipe(recipe: Recipe, pantry: PantryItem[]): Recipe {
  const pantryIngredientIds = new Set(pantry.map((item) => item.ingredientId));
  const ingredients = recipe.ingredients.map((ingredient) => ({
    ...ingredient,
    isOwned: ingredient.isPantryStaple ? true : pantryIngredientIds.has(ingredient.ingredientId),
  }));
  const owned = ingredients.filter((i) => i.isOwned).length;
  return { ...recipe, ingredients, smartMatchScore: computeMatchScore(owned, ingredients.length) };
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
  const userId = await requireUserId();
  const [recipes, pantry] = await Promise.all([fetchRecipeVersions(), fetchPantryItems(userId, 'UTC')]);
  return recipes.map((recipe) => hydrateRecipe(recipe, pantry));
}

async function getRecipeById(id: string): Promise<Recipe | null> {
  const userId = await requireUserId();
  const [recipe, pantry] = await Promise.all([fetchRecipeVersionById(id), fetchPantryItems(userId, 'UTC')]);
  return recipe ? hydrateRecipe(recipe, pantry) : null;
}

async function getRecipeCollections(): Promise<RecipeCollection[]> {
  const hydrated = await getRecipes();
  return (Object.keys(COLLECTION_TITLES) as RecipeCollectionId[]).map((id) => ({
    id,
    title: COLLECTION_TITLES[id],
    recipes: hydrated.filter((recipe) => recipe.collections.includes(id)),
  }));
}

/** Recipes the user could cook right now with zero shopping. */
async function countReadyToCookRecipes(): Promise<number> {
  const recipes = await getRecipes();
  return recipes.filter((recipe) => getMissingIngredients(recipe).length === 0).length;
}

async function getSavedRecipes(): Promise<SavedRecipe[]> {
  const userId = await requireUserId();
  return fetchSavedRecipes(userId);
}

async function saveRecipe(recipeVersionId: string, notes?: string): Promise<SavedRecipe> {
  const userId = await requireUserId();
  return saveRecipeRow(userId, recipeVersionId, notes);
}

async function unsaveRecipe(recipeVersionId: string): Promise<void> {
  const userId = await requireUserId();
  return unsaveRecipeRow(userId, recipeVersionId);
}

export const recipeService = {
  getRecipes,
  getRecipeById,
  getRecipeCollections,
  countReadyToCookRecipes,
  getSavedRecipes,
  saveRecipe,
  unsaveRecipe,
};
