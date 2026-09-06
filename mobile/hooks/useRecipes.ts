import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { nutritionService, recipeService } from '@/services';
import { Recipe } from '@/types';
import { queryKeys } from './queryKeys';

export function useRecipes() {
  return useQuery({ queryKey: queryKeys.recipes, queryFn: recipeService.getRecipes });
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recipe(id ?? ''),
    queryFn: () => recipeService.getRecipeById(id as string),
    enabled: !!id,
  });
}

export function useRecipeCollections() {
  return useQuery({ queryKey: queryKeys.recipeCollections, queryFn: recipeService.getRecipeCollections });
}

/**
 * Ingredient-level nutrition coverage for one recipe (resolved vs total,
 * verified/estimated/partial). Separate query so the recipe screen renders
 * immediately and the coverage badge fills in.
 */
export function useRecipeNutritionCoverage(recipe: Recipe | null | undefined) {
  const versionId = recipe?.recipeVersionId ?? recipe?.id;
  return useQuery({
    queryKey: queryKeys.recipeNutritionCoverage(versionId ?? ''),
    queryFn: () =>
      nutritionService.getRecipeNutritionCoverage(
        (recipe as Recipe).ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
          unit: i.unit,
          isOptional: i.isOptional,
        })),
      ),
    enabled: !!recipe,
  });
}

export function useReadyToCookCount() {
  return useQuery({ queryKey: queryKeys.readyToCookCount, queryFn: recipeService.countReadyToCookRecipes });
}

export function useSavedRecipes() {
  return useQuery({ queryKey: queryKeys.savedRecipes, queryFn: recipeService.getSavedRecipes });
}

function useInvalidateSavedRecipes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.savedRecipes });
}

/** Idempotent - saving an already-saved recipe version just resolves with the existing row. */
export function useSaveRecipe() {
  const invalidate = useInvalidateSavedRecipes();
  return useMutation({
    mutationFn: ({ recipeVersionId, notes }: { recipeVersionId: string; notes?: string }) =>
      recipeService.saveRecipe(recipeVersionId, notes),
    onSuccess: invalidate,
  });
}

export function useUnsaveRecipe() {
  const invalidate = useInvalidateSavedRecipes();
  return useMutation({
    mutationFn: (recipeVersionId: string) => recipeService.unsaveRecipe(recipeVersionId),
    onSuccess: invalidate,
  });
}
