import { NutritionSnapshot, Recipe, RecipeCollectionId, RecipeDifficulty, RecipeIngredient, RecipeTrustLabel, RecommendationReason, SavedRecipe } from '@/types';
import { Database } from '@/types/database.types';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { supabase } from '../client';

type RecipeVersionRow = Database['public']['Tables']['recipe_versions']['Row'];
type RecipeIngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'];
type RecipeRow = Database['public']['Tables']['recipes']['Row'];
type SavedRecipeRow = Database['public']['Tables']['saved_recipes']['Row'];

interface RecipeVersionJoinRow extends RecipeVersionRow {
  recipes: Pick<RecipeRow, 'trust_label' | 'visibility' | 'owner_id'> | null;
  recipe_ingredients: RecipeIngredientRow[];
}

const RECIPE_VERSION_SELECT = '*, recipes(trust_label,visibility,owner_id), recipe_ingredients(*)';

function mapIngredientRow(row: RecipeIngredientRow): RecipeIngredient {
  const name = row.display_name;
  // catalog_ingredient_id is a suggestion-only hint; fall back to the row's
  // own id so every ingredient still has a stable identity for isOwned
  // lookups even when no catalog match exists.
  const ingredientId = row.catalog_ingredient_id ?? row.id;
  return {
    ingredientId,
    name,
    imageUri: ingredientPhotoUri(ingredientId, name),
    // Every Phase 3 seeded ingredient has a real quantity/unit; the fallback
    // only guards against a hypothetical future ingredient authored without one.
    quantity: row.quantity ?? 0,
    unit: (row.unit ?? 'item') as RecipeIngredient['unit'],
    isPantryStaple: row.is_pantry_staple,
    recipeIngredientId: row.id,
    isOptional: row.is_optional,
    preparation: row.preparation ?? undefined,
  };
}

function mapVersionRow(row: RecipeVersionJoinRow): Recipe {
  const snapshot = row.nutrition_snapshot as unknown as NutritionSnapshot;
  const ingredients = [...row.recipe_ingredients].sort((a, b) => a.sort_order - b.sort_order).map(mapIngredientRow);

  return {
    id: row.id,
    recipeVersionId: row.id,
    title: row.title,
    imageUri: row.image_uri ?? '',
    prepTimeMinutes: row.prep_time_minutes ?? 0,
    cookTimeMinutes: row.cook_time_minutes ?? 0,
    difficulty: (row.difficulty ?? 'easy') as RecipeDifficulty,
    servings: row.servings,
    additionalCostEstimate: row.additional_cost_estimate ?? 0,
    // Computed by recipeService against the live pantry on every read - not
    // stored, not learned. 0 here is only ever an intermediate value.
    smartMatchScore: 0,
    // Convenience non-null projection - safe because every Phase 3 recipe
    // has complete per-serving macros. See nutritionSnapshot for the honest,
    // nullable-fields version.
    nutritionPerServing: {
      calories: snapshot.calories ?? 0,
      proteinG: snapshot.proteinG ?? 0,
      carbsG: snapshot.carbsG ?? 0,
      fatG: snapshot.fatG ?? 0,
      fiberG: snapshot.fiberG ?? 0,
    },
    nutritionSnapshot: snapshot,
    nutritionStatus: row.nutrition_status,
    reasons: Array.isArray(row.demo_reasons) ? (row.demo_reasons as unknown as RecommendationReason[]) : [],
    ingredients,
    steps: row.instructions,
    cuisines: row.cuisines,
    tags: row.tags,
    collections: row.collections as RecipeCollectionId[],
    trustLabel: (row.recipes?.trust_label ?? 'demo') as RecipeTrustLabel,
  };
}

export async function fetchRecipeVersions(): Promise<Recipe[]> {
  const { data, error } = await supabase.from('recipe_versions').select(RECIPE_VERSION_SELECT);
  if (error) throw error;
  return (data as unknown as RecipeVersionJoinRow[]).map(mapVersionRow);
}

export async function fetchRecipeVersionById(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipe_versions').select(RECIPE_VERSION_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapVersionRow(data as unknown as RecipeVersionJoinRow) : null;
}

function mapSavedRow(row: SavedRecipeRow): SavedRecipe {
  return { id: row.id, recipeVersionId: row.recipe_version_id, savedAt: row.saved_at, notes: row.notes ?? undefined };
}

export async function fetchSavedRecipes(userId: string): Promise<SavedRecipe[]> {
  const { data, error } = await supabase.from('saved_recipes').select('*').eq('user_id', userId);
  if (error) throw error;
  return data.map(mapSavedRow);
}

/** Idempotent: saving an already-saved recipe version just returns the existing row. */
export async function saveRecipe(userId: string, recipeVersionId: string, notes?: string): Promise<SavedRecipe> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .upsert(
      { user_id: userId, recipe_version_id: recipeVersionId, notes: notes ?? null },
      { onConflict: 'user_id,recipe_version_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return mapSavedRow(data);
}

export async function unsaveRecipe(userId: string, recipeVersionId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_recipes')
    .delete()
    .eq('user_id', userId)
    .eq('recipe_version_id', recipeVersionId);
  if (error) throw error;
}
