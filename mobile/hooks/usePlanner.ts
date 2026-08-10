import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { plannerService } from '@/services';
import { DayOfWeek, MealType } from '@/types';
import { haptics } from '@/utils/haptics';
import { queryKeys } from './queryKeys';

export function useMealPlan() {
  return useQuery({ queryKey: queryKeys.mealPlan, queryFn: plannerService.getMealPlan });
}

function useInvalidateMealPlan() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan });
}

export function useAddMealPlanItem() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: ({ day, mealType, recipeId }: { day: DayOfWeek; mealType: MealType; recipeId: string }) =>
      plannerService.addMealPlanItem(day, mealType, recipeId),
    onSuccess: invalidate,
  });
}

export function useReplaceMealPlanItem() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: ({ itemId, recipeId }: { itemId: string; recipeId: string }) =>
      plannerService.replaceMealPlanItem(itemId, recipeId),
    onSuccess: invalidate,
  });
}

export function useRemoveMealPlanItem() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: (itemId: string) => plannerService.removeMealPlanItem(itemId),
    onSuccess: invalidate,
  });
}

export function useMoveMealPlanItem() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: ({ itemId, day, mealType }: { itemId: string; day: DayOfWeek; mealType: MealType }) =>
      plannerService.moveMealPlanItem(itemId, day, mealType),
    onSuccess: invalidate,
  });
}

export function useGenerateWeek() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: plannerService.generateWeek,
    onSuccess: () => {
      haptics.success();
      invalidate();
    },
  });
}
