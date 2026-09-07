import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { groceryService, groceryTransferService, ManualGroceryItemInput, UpdateGroceryItemInput } from '@/services';
import type { RecipeShortfall } from '@/services';
import { GroceryTransferItemInput } from '@/lib/validation/grocerySchemas';
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

/**
 * Transfers a reviewed set of acquired grocery lines into the pantry. Retry-safe
 * (idempotent per grocery line); invalidates both the grocery list (transfer
 * state) and the pantry (new lots).
 */
export function useTransferGroceryItemsToPantry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inputs: GroceryTransferItemInput[]) => groceryTransferService.transferItemsToPantry(inputs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.groceryList });
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry });
    },
  });
}
