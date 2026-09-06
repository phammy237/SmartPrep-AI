import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CreateMealPlanEntryInput, UpdateMealPlanEntryInput } from '@/lib/validation/plannerSchemas';
import { plannerService } from '@/services';
import { haptics } from '@/utils/haptics';
import { localWeekRange } from '@/utils/nutritionSnapshot';
import { queryKeys } from './queryKeys';
import { useUser } from './useUser';

/** Same timezone-resolution pattern as usePantry's useTimeZone - falls back to UTC until the profile has loaded. */
function useTimeZone(): string {
  const userQuery = useUser();
  return userQuery.data?.timezone ?? 'UTC';
}

/** The Monday-Sunday week containing "today" in the user's timezone. */
export function useCurrentWeekRange(): { weekStart: string; weekEnd: string } {
  const timeZone = useTimeZone();
  return localWeekRange(new Date(), timeZone);
}

export function useMealPlanWeek() {
  const timeZone = useTimeZone();
  const { weekStart, weekEnd } = localWeekRange(new Date(), timeZone);
  const query = useQuery({
    queryKey: queryKeys.mealPlanWeek(weekStart, weekEnd),
    queryFn: () => plannerService.getMealPlanForWeek(weekStart, weekEnd),
  });
  return { ...query, weekStart, weekEnd, timeZone };
}

function useInvalidateMealPlan() {
  const queryClient = useQueryClient();
  // queryKeys.mealPlan is a prefix of every queryKeys.mealPlanWeek(...) key,
  // so this invalidates every cached week, not just the current one.
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan });
}

export function useAddMealPlanEntry() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: (input: CreateMealPlanEntryInput) => plannerService.addMealPlanEntry(input),
    onSuccess: invalidate,
  });
}

/** Covers edit (date/time/servings/notes/recipe), and status changes (skip/cancel/complete) - completing a plan item never itself creates a meal log. */
export function useUpdateMealPlanEntry() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMealPlanEntryInput }) => plannerService.updateMealPlanEntry(id, patch),
    onSuccess: invalidate,
  });
}

export function useRemoveMealPlanEntry() {
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: (id: string) => plannerService.removeMealPlanEntry(id),
    onSuccess: invalidate,
  });
}

export function useGenerateWeek() {
  const timeZone = useTimeZone();
  const invalidate = useInvalidateMealPlan();
  return useMutation({
    mutationFn: () => {
      const { weekStart, weekEnd } = localWeekRange(new Date(), timeZone);
      return plannerService.generateWeek(weekStart, weekEnd, timeZone);
    },
    onSuccess: () => {
      haptics.success();
      invalidate();
    },
  });
}
