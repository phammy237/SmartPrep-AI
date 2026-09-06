import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mealLogService } from '@/services';
import { NutritionSnapshot } from '@/types';
import { haptics } from '@/utils/haptics';
import { queryKeys } from './queryKeys';

export function useMealLogs(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.mealLogs(startDate, endDate),
    queryFn: () => mealLogService.getMealLogs(startDate, endDate),
  });
}

function useInvalidateMealLogs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
}

export function useQuickAddMealLog() {
  const invalidate = useInvalidateMealLogs();
  return useMutation({
    mutationFn: (params: {
      mealType: string;
      nutrition: NutritionSnapshot;
      notes?: string;
      idempotencyKey: string;
      consumedAt?: string;
    }) => mealLogService.quickAdd(params),
    onSuccess: () => {
      haptics.success();
      invalidate();
    },
  });
}

/** Soft void - the UI's "Remove" action. Never a hard delete. */
export function useVoidMealLog() {
  const invalidate = useInvalidateMealLogs();
  return useMutation({
    mutationFn: ({ mealLogId, reason }: { mealLogId: string; reason: string }) => mealLogService.voidLog(mealLogId, reason),
    onSuccess: invalidate,
  });
}

/** Voids the original and creates a typed replacement atomically - the "Correct" action on a recent meal log. */
export function useCorrectMealLog() {
  const invalidate = useInvalidateMealLogs();
  return useMutation({
    mutationFn: (params: {
      mealLogId: string;
      reason: string;
      newMealType: string;
      newNutrition: NutritionSnapshot;
      newServingsConsumed?: number;
      newGramsConsumed?: number;
      newNotes?: string;
      newIdempotencyKey?: string;
      newConsumedAt?: string;
    }) => mealLogService.correctLog(params),
    onSuccess: () => {
      haptics.success();
      invalidate();
    },
  });
}
