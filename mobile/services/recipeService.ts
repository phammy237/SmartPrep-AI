import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { IngredientCoverage, computeIngredientCoverage } from '@/lib/nutrition/pantryCoverage';
import { indexPantryLots, lotsForIngredient } from '@/lib/nutrition/pantryLots';
import {
  fetchPantryItems,
  fetchRecipeVersionById,
  fetchRecipeVersions,
  fetchSavedRecipes,
  saveRecipe as saveRecipeRow,
  unsaveRecipe as unsaveRecipeRow,
} from '@/lib/supabase/repositories';
import { PantryItem, Recipe, RecipeCollectionId, RecipeIngredient, SavedRecipe } from '@/types';
import { nutritionService } from './nutritionService';
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

function computeMatchScore(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 100);
}

/**
 * Hydrates each ingredient with quantity-aware `coverage` against the live
 * pantry and the shared conversion engine. `isOwned` is kept as a convenience
 * boolean = (coverage.status === 'covered'). `smartMatchScore` is the share of
 * fully-covered ingredients.
 */
function hydrateRecipe(
  recipe: Recipe,
  pantry: PantryItem[],
  conversionMeta: Map<string, IngredientConversionMeta>,
): Recipe {
  const index = indexPantryLots(pantry);
  const ingredients = recipe.ingredients.map((ingredient) => {
    const coverage = computeIngredientCoverage({
      ingredientId: ingredient.ingredientId,
      requiredQuantity: ingredient.quantity,
      requiredUnit: ingredient.unit,
      isPantryStaple: ingredient.isPantryStaple,
      lots: lotsForIngredient(ingredient, index),
      conversionMeta: conversionMeta.get(ingredient.ingredientId),
    });
    return { ...ingredient, coverage, isOwned: coverage.status === 'covered' };
  });
  const covered = ingredients.filter((i) => i.isOwned).length;
  return { ...recipe, ingredients, smartMatchScore: computeMatchScore(covered, ingredients.length) };
}

export function getRecipeAvailability(recipe: Recipe): { owned: number; total: number } {
  const owned = recipe.ingredients.filter((i) => i.isOwned).length;
  return { owned, total: recipe.ingredients.length };
}

/**
 * Ingredients the pantry has NONE of. Quantity-aware now: a partially-covered
 * or unresolved ingredient is NOT "missing" (use `getRecipeShortfalls` for the
 * full grocery picture). Falls back to the old boolean only for a recipe that
 * somehow wasn't hydrated.
 */
export function getMissingIngredients(recipe: Recipe): RecipeIngredient[] {
  return recipe.ingredients.filter((i) => (i.coverage ? i.coverage.status === 'missing' : !i.isOwned && !i.isPantryStaple));
}

export interface RecipeShortfall {
  ingredient: RecipeIngredient;
  coverage: IngredientCoverage;
}

/** Every ingredient that is not fully covered - missing, partial, OR unresolved. Drives grocery generation. */
export function getRecipeShortfalls(recipe: Recipe): RecipeShortfall[] {
  const out: RecipeShortfall[] = [];
  for (const ingredient of recipe.ingredients) {
    if (ingredient.coverage && ingredient.coverage.status !== 'covered') {
      out.push({ ingredient, coverage: ingredient.coverage });
    }
  }
  return out;
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

async function hydrateAll(recipes: Recipe[], pantry: PantryItem[]): Promise<Recipe[]> {
  const ids = Array.from(new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.ingredientId))));
  const conversionMeta = await nutritionService.getConversionMetaMap(ids);
  return recipes.map((recipe) => hydrateRecipe(recipe, pantry, conversionMeta));
}

async function getRecipes(): Promise<Recipe[]> {
  const userId = await requireUserId();
  const [recipes, pantry] = await Promise.all([fetchRecipeVersions(), fetchPantryItems(userId, 'UTC')]);
  return hydrateAll(recipes, pantry);
}

async function getRecipeById(id: string): Promise<Recipe | null> {
  const userId = await requireUserId();
  const [recipe, pantry] = await Promise.all([fetchRecipeVersionById(id), fetchPantryItems(userId, 'UTC')]);
  if (!recipe) return null;
  const [hydrated] = await hydrateAll([recipe], pantry);
  return hydrated;
}

async function getRecipeCollections(): Promise<RecipeCollection[]> {
  const hydrated = await getRecipes();
  return (Object.keys(COLLECTION_TITLES) as RecipeCollectionId[]).map((id) => ({
    id,
    title: COLLECTION_TITLES[id],
    recipes: hydrated.filter((recipe) => recipe.collections.includes(id)),
  }));
}

/** Recipes the user could cook right now with zero shopping - EVERY non-staple ingredient fully covered. */
async function countReadyToCookRecipes(): Promise<number> {
  const recipes = await getRecipes();
  return recipes.filter((recipe) => getRecipeShortfalls(recipe).length === 0).length;
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
