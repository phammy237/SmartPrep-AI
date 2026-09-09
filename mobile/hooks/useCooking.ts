import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DeductionInput } from '@/lib/validation/cookingSchemas';
import { cookingService, nutritionService } from '@/services';
import { haptics } from '@/utils/haptics';
import { invalidatePantryDerivedQueries } from './invalidatePantryDerived';
import { queryKeys } from './queryKeys';

/**
 * Merged unit-conversion metadata (catalog default + user overrides) for a set
 * of canonical ingredient ids - fetched ONCE for the whole cooking screen so
 * the FEFO deduction proposal never does an N+1 lookup per recipe ingredient.
 */
export function useConversionMeta(ingredientIds: string[]) {
  const ids = Array.from(new Set(ingredientIds)).sort();
  return useQuery({
    queryKey: queryKeys.conversionMeta(ids),
    queryFn: () => nutritionService.getConversionMetaMap(ids),
    enabled: ids.length > 0,
  });
}

/**
 * After cooking completion: pantry (quantities changed), recipes/collections/
 * ready-to-cook (pantry-derived match scores changed), prepared meals (new
 * balance), meal plan (linked item may now be completed), and meal logs (a
 * log may have been created) - matching the "after cooking completion,
 * invalidate at least..." requirement.
 */
function useInvalidateAfterCooking() {
  const queryClient = useQueryClient();
  return () => {
    // Pantry + everything derived from it (coverage, collections, ready-to-cook,
    // Use-Soon recommendations).
    invalidatePantryDerivedQueries(queryClient);
    // Cooking-specific extras: new prepared-meal balance, a meal-plan item that
    // may now be completed, and a meal log that may have been created.
    queryClient.invalidateQueries({ queryKey: queryKeys.preparedMeals });
    queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan });
    queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
  };
}

/** The only place a cooking_events row is created - call only from an explicit "Start Cooking" press. */
export function useStartCookingEvent() {
  return useMutation({
    mutationFn: (params: {
      recipeVersionId: string;
      mealPlanItemId?: string;
      plannedServings?: number;
      idempotencyKey: string;
    }) => cookingService.startCooking(params),
  });
}

export function useCancelCookingEvent() {
  return useMutation({
    mutationFn: ({ cookingEventId, reason }: { cookingEventId: string; reason?: string }) =>
      cookingService.cancelCooking(cookingEventId, reason),
  });
}

/** Confirmed server result only - no optimistic update, since pantry deductions and prepared-meal creation must reflect exactly what the server validated. */
export function useCompleteCookingEvent() {
  const invalidate = useInvalidateAfterCooking();
  return useMutation({
    mutationFn: (params: {
      cookingEventId: string;
      actualServingsPrepared: number;
      deductions: DeductionInput[];
      finalBatchWeightG?: number;
      servingsConsumedNow: number;
      mealType?: string;
      notes?: string;
    }) => cookingService.finishCooking(params),
    onSuccess: () => {
      haptics.success();
      invalidate();
    },
  });
}
