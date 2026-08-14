import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { preparedMealService } from '@/services';
import { PreparedMeal } from '@/types';
import { haptics } from '@/utils/haptics';
import { queryKeys } from './queryKeys';

export function usePreparedMeals(status?: PreparedMeal['status']) {
  return useQuery({
    queryKey: status ? [...queryKeys.preparedMeals, status] : queryKeys.preparedMeals,
    queryFn: () => preparedMealService.getPreparedMeals(status),
  });
}

function useInvalidatePreparedMeals() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.preparedMeals });
    queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
  };
}

/** Confirmed server result only - the remaining-servings balance must reflect exactly what the server validated (never exceeds what's left). */
export function useLogPreparedMealConsumption() {
  const invalidate = useInvalidatePreparedMeals();
  return useMutation({
    mutationFn: (params: {
      preparedMealId: string;
      servingsConsumed: number;
      mealType: string;
      notes?: string;
      idempotencyKey?: string;
    }) => preparedMealService.logConsumption(params),
    onSuccess: () => {
      haptics.success();
      invalidate();
    },
  });
}
