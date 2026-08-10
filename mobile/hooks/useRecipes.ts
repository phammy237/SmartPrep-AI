import { useQuery } from '@tanstack/react-query';

import { recipeService } from '@/services';
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

export function useReadyToCookCount() {
  return useQuery({ queryKey: queryKeys.readyToCookCount, queryFn: recipeService.countReadyToCookRecipes });
}
