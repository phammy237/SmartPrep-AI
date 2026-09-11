import { MealLog, NutritionSnapshot, PREPARED_MEAL_STATUS_VALUES, PreparedMeal } from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';
import { assertEnumValue } from './enumMappers';
import { mapMealLogRow } from './mealLogRepository';

type PreparedMealRow = Database['public']['Tables']['prepared_meals']['Row'];

export function mapPreparedMealRow(row: PreparedMealRow): PreparedMeal {
  return {
    id: row.id,
    cookingEventId: row.cooking_event_id,
    recipeVersionId: row.recipe_version_id,
    totalServingsPrepared: row.total_servings_prepared,
    servingsRemaining: row.servings_remaining,
    totalBatchWeightG: row.total_batch_weight_g ?? undefined,
    remainingBatchWeightG: row.remaining_batch_weight_g ?? undefined,
    nutritionSnapshot: row.nutrition_snapshot as unknown as NutritionSnapshot,
    nutritionPerServing: row.nutrition_per_serving as unknown as NutritionSnapshot,
    nutritionPerGram: row.nutrition_per_gram ? (row.nutrition_per_gram as unknown as NutritionSnapshot) : undefined,
    preparedAt: row.prepared_at,
    storageLocation: row.storage_location ?? undefined,
    useByDate: row.use_by_date ?? undefined,
    status: assertEnumValue(PREPARED_MEAL_STATUS_VALUES, row.status, 'prepared_meals.status'),
  };
}

export async function fetchPreparedMeals(userId: string, status?: PreparedMeal['status']): Promise<PreparedMeal[]> {
  let query = supabase.from('prepared_meals').select('*').eq('user_id', userId);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('prepared_at', { ascending: false });
  if (error) throw error;
  return data.map(mapPreparedMealRow);
}

export async function logPreparedMealConsumption(params: {
  preparedMealId: string;
  servingsConsumed: number;
  mealType: string;
  notes?: string;
  idempotencyKey?: string;
}): Promise<{ preparedMeal: PreparedMeal; mealLog: MealLog }> {
  // p_notes / p_idempotency_key are `DEFAULT NULL` SQL params (migration 0003).
  const { data, error } = await supabase.rpc('log_prepared_meal_consumption', {
    p_prepared_meal_id: params.preparedMealId,
    p_servings_consumed: params.servingsConsumed,
    p_meal_type: params.mealType,
    ...(params.notes != null ? { p_notes: params.notes } : {}),
    ...(params.idempotencyKey != null ? { p_idempotency_key: params.idempotencyKey } : {}),
  });
  if (error) throw error;
  const result = data as unknown as { preparedMeal: PreparedMealRow; mealLog: Database['public']['Tables']['meal_logs']['Row'] };
  return { preparedMeal: mapPreparedMealRow(result.preparedMeal), mealLog: mapMealLogRow(result.mealLog) };
}
