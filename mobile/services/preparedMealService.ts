import { fetchPreparedMeals, logPreparedMealConsumption } from '@/lib/supabase/repositories';
import { MealLog, PreparedMeal } from '@/types';
import { requireUserId } from './requireUserId';

async function getPreparedMeals(status?: PreparedMeal['status']): Promise<PreparedMeal[]> {
  const userId = await requireUserId();
  return fetchPreparedMeals(userId, status);
}

async function logConsumption(params: {
  preparedMealId: string;
  servingsConsumed: number;
  mealType: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{ preparedMeal: PreparedMeal; mealLog: MealLog }> {
  return logPreparedMealConsumption(params);
}

export const preparedMealService = {
  getPreparedMeals,
  logConsumption,
};
