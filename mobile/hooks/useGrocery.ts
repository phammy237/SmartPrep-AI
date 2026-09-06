import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { groceryService, ManualGroceryItemInput, UpdateGroceryItemInput } from '@/services';
import type { RecipeShortfall } from '@/services';
import { queryKeys } from './queryKeys';

export function useGroceryList() {
  return useQuery({ queryKey: queryKeys.groceryList, queryFn: groceryService.getGroceryList });
}

function useInvalidateGroceryList() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.groceryList });
}

export function useToggleGroceryItem() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: (id: string) => groceryService.toggleGroceryItem(id),
    onSuccess: invalidate,
  });
}

export function useAddGroceryItem() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: (input: ManualGroceryItemInput) => groceryService.addGroceryItem(input),
    onSuccess: invalidate,
  });
}

export function useUpdateGroceryItem() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateGroceryItemInput }) =>
      groceryService.updateGroceryItem(id, patch),
    onSuccess: invalidate,
  });
}

export function useRemoveGroceryItem() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: (id: string) => groceryService.removeGroceryItem(id),
    onSuccess: invalidate,
  });
}

export function useClearCheckedGroceryItems() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: () => groceryService.clearCheckedItems(),
    onSuccess: invalidate,
  });
}

export function useAddRecipeShortfallsToGroceryList() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: ({ recipeId, shortfalls }: { recipeId: string; shortfalls: RecipeShortfall[] }) =>
      groceryService.addRecipeShortfallsToGroceryList(recipeId, shortfalls),
    onSuccess: invalidate,
  });
}
