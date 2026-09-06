import { MealLog, NutritionSnapshot } from '@/types';
import { Database, Json } from '@/types/database.types';
import { supabase } from '../client';

// NutritionSnapshot is a closed interface (no index signature), so it isn't
// structurally assignable to the open Json type - this is a plain data
// shape being handed to a jsonb RPC parameter, not an unsafe cast.
function toJson(snapshot: NutritionSnapshot): Json {
  return snapshot as unknown as Json;
}

type MealLogRow = Database['public']['Tables']['meal_logs']['Row'];

export function mapMealLogRow(row: MealLogRow): MealLog {
  return {
    id: row.id,
    consumedAt: row.consumed_at,
    localDate: row.local_date,
    timezone: row.timezone,
    mealType: row.meal_type,
    recipeVersionId: row.recipe_version_id ?? undefined,
    cookingEventId: row.cooking_event_id ?? undefined,
    preparedMealId: row.prepared_meal_id ?? undefined,
    servingsConsumed: row.servings_consumed ?? undefined,
    gramsConsumed: row.grams_consumed ?? undefined,
    nutritionSnapshot: row.nutrition_snapshot as unknown as NutritionSnapshot,
    nutritionStatus: row.nutrition_status,
    logSource: row.log_source,
    notes: row.notes ?? undefined,
    voidedAt: row.voided_at ?? undefined,
    voidReason: row.void_reason ?? undefined,
    replacedByLogId: row.replaced_by_log_id ?? undefined,
    createdAt: row.created_at,
  };
}

/** Includes voided rows (callers filter with !voidedAt for totals) so a correction's history stays visible if ever needed. */
export async function fetchMealLogs(userId: string, startDate: string, endDate: string): Promise<MealLog[]> {
  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', startDate)
    .lte('local_date', endDate)
    .order('consumed_at', { ascending: false });
  if (error) throw error;
  return data.map(mapMealLogRow);
}

export async function quickAddMealLog(params: {
  mealType: string;
  nutrition: NutritionSnapshot;
  notes?: string;
  idempotencyKey: string;
  consumedAt?: string;
}): Promise<MealLog> {
  const { data, error } = await supabase.rpc('quick_add_meal_log', {
    p_meal_type: params.mealType,
    p_nutrition: toJson(params.nutrition),
    p_idempotency_key: params.idempotencyKey,
    p_notes: params.notes ?? null,
    p_consumed_at: params.consumedAt ?? null,
  });
  if (error) throw error;
  return mapMealLogRow(data);
}

/** Soft-void only - the restricted column grant + protect_meal_log_immutability trigger enforce this can never edit the nutrition snapshot or un-void a row. Used for the UI's "Remove" action (no replacement). */
export async function voidMealLog(mealLogId: string, reason: string): Promise<MealLog> {
  const { data, error } = await supabase
    .from('meal_logs')
    .update({ voided_at: new Date().toISOString(), void_reason: reason })
    .eq('id', mealLogId)
    .select()
    .single();
  if (error) throw error;
  return mapMealLogRow(data);
}

/** Atomically voids the old log and inserts a typed replacement via correct_meal_log - never writes replaced_by_log_id from the client directly (no grant exists for it), and never mutates the original's nutrition_snapshot. */
export async function correctMealLog(params: {
  mealLogId: string;
  reason: string;
  newMealType: string;
  newNutrition: NutritionSnapshot;
  newServingsConsumed?: number;
  newGramsConsumed?: number;
  newNotes?: string;
  newIdempotencyKey?: string;
  newConsumedAt?: string;
}): Promise<{ voided: MealLog; replacement: MealLog }> {
  const { data, error } = await supabase.rpc('correct_meal_log', {
    p_meal_log_id: params.mealLogId,
    p_reason: params.reason,
    p_new_meal_type: params.newMealType,
    p_new_nutrition: toJson(params.newNutrition),
    p_new_servings_consumed: params.newServingsConsumed ?? null,
    p_new_grams_consumed: params.newGramsConsumed ?? null,
    p_new_notes: params.newNotes ?? null,
    p_new_idempotency_key: params.newIdempotencyKey ?? null,
    p_new_consumed_at: params.newConsumedAt ?? null,
  });
  if (error) throw error;
  const result = data as unknown as { voided: MealLogRow; replacement: MealLogRow };
  return { voided: mapMealLogRow(result.voided), replacement: mapMealLogRow(result.replacement) };
}
