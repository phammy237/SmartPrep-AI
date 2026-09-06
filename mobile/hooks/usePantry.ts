import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EditPantryItemMetadataInput } from '@/lib/validation/pantrySchemas';
import { pantryService } from '@/services';
import { PantryItem } from '@/types';
import { queryKeys } from './queryKeys';
import { useUser } from './useUser';

/** Pantry expiration math is timezone-aware; this is the single place that resolves which timezone to use, falling back to UTC until the profile has loaded. */
function useTimeZone(): string {
  const userQuery = useUser();
  return userQuery.data?.timezone ?? 'UTC';
}

export function usePantry() {
  const timeZone = useTimeZone();
  return useQuery({ queryKey: queryKeys.pantry, queryFn: () => pantryService.getPantry(timeZone) });
}

/**
 * Read-time nutrition resolution for one pantry item (secondary to the item
 * itself). Resolves to an explicit `unresolved` state when the quantity/unit
 * can't be converted or no reference exists - the query only errors on a real
 * infrastructure failure (auth / Supabase).
 */
export function usePantryItemNutrition(item: PantryItem | null | undefined) {
  return useQuery({
    queryKey: item
      ? queryKeys.pantryItemNutrition(item.id, item.quantity, item.unit)
      : queryKeys.pantryItemNutrition('none', 0, ''),
    queryFn: () =>
      pantryService.resolveItemNutrition({
        ingredientId: (item as PantryItem).ingredientId,
        quantity: (item as PantryItem).quantity,
        unit: (item as PantryItem).unit,
      }),
    enabled: !!item,
  });
}

export function usePantryItem(id: string | undefined) {
  const timeZone = useTimeZone();
  return useQuery({
    queryKey: queryKeys.pantryItem(id ?? ''),
    queryFn: () => pantryService.getPantryItem(id as string, timeZone),
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

export function useAddManualPantryItem() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: (input: Parameters<typeof pantryService.addManualPantryItem>[0]) =>
      pantryService.addManualPantryItem(input, timeZone),
    onSuccess: invalidate,
  });
}

export function useUpdatePantryItemMetadata() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EditPantryItemMetadataInput }) =>
      pantryService.updateItemMetadata(id, patch, timeZone),
    onSuccess: invalidate,
  });
}

export function useAdjustPantryQuantity() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({
      itemId,
      delta,
      eventType,
      reason,
    }: {
      itemId: string;
      delta: number;
      eventType: 'adjusted' | 'consumed' | 'deducted_by_cooking';
      reason?: string;
    }) => pantryService.adjustQuantity(itemId, delta, eventType, reason, timeZone),
    onSuccess: invalidate,
  });
}

export function useDepletePantryItem() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({
      itemId,
      eventType,
      reason,
    }: {
      itemId: string;
      eventType: 'depleted' | 'discarded' | 'corrected';
      reason?: string;
    }) => pantryService.depleteItem(itemId, eventType, reason, timeZone),
    onSuccess: invalidate,
  });
}

export function useRestorePantryItem() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason?: string }) =>
      pantryService.restoreItem(itemId, reason, timeZone),
    onSuccess: invalidate,
  });
}

export function useConfirmPantryItem() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: (itemId: string) => pantryService.confirmStillHave(itemId, timeZone),
    onSuccess: invalidate,
  });
}
