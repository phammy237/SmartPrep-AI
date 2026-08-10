import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { groceryService, ManualGroceryItemInput } from '@/services';
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

export function useRemoveGroceryItem() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: (id: string) => groceryService.removeGroceryItem(id),
    onSuccess: invalidate,
  });
}

export function useAddMissingIngredientsForRecipe() {
  const invalidate = useInvalidateGroceryList();
  return useMutation({
    mutationFn: (recipeId: string) => groceryService.addMissingIngredientsForRecipe(recipeId),
    onSuccess: invalidate,
  });
}
