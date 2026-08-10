import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { pantryService } from '@/services';
import { FreshnessState, PantryItem } from '@/types';
import { queryKeys } from './queryKeys';

export function usePantry() {
  return useQuery({ queryKey: queryKeys.pantry, queryFn: pantryService.getPantry });
}

export function usePantryItem(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.pantryItem(id ?? ''),
    queryFn: () => pantryService.getPantryItem(id as string),
    enabled: !!id,
  });
}

function useInvalidatePantry() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pantry });
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
    queryClient.invalidateQueries({ queryKey: queryKeys.recipeCollections });
    queryClient.invalidateQueries({ queryKey: queryKeys.readyToCookCount });
  };
}

export function useUpdatePantryItem() {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<PantryItem, 'quantity' | 'unit' | 'category' | 'notes'>> }) =>
      pantryService.updatePantryItem(id, patch),
    onSuccess: invalidate,
  });
}

export function useUpdatePantryItemFreshness() {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { score?: number; confidence?: number; label?: FreshnessState['label']; estimatedUseBy?: string };
    }) => pantryService.updatePantryItemFreshness(id, patch),
    onSuccess: invalidate,
  });
}

export function useUseSomePantryItem() {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({ id, amountUsed }: { id: string; amountUsed: number }) =>
      pantryService.useSomePantryItem(id, amountUsed),
    onSuccess: invalidate,
  });
}

/** Applies several "used some" decrements at once (e.g. after cooking), in parallel with a single cache invalidation. */
export function useUseSomeManyPantryItems() {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: (items: { id: string; amountUsed: number }[]) =>
      Promise.all(items.map((item) => pantryService.useSomePantryItem(item.id, item.amountUsed))),
    onSuccess: invalidate,
  });
}

export function useRemovePantryItem() {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: 'finished' | 'discarded' | 'removed' }) =>
      pantryService.removePantryItem(id, reason),
    onSuccess: invalidate,
  });
}

export function useAddManualPantryItem() {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: pantryService.addManualPantryItem,
    onSuccess: invalidate,
  });
}
