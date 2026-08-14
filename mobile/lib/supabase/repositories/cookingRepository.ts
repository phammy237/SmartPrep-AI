import { DeductionInput } from '@/lib/validation/cookingSchemas';
import { CompleteCookingEventResult, CookingEvent, CookingEventIngredient } from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';
import { mapMealLogRow } from './mealLogRepository';
import { mapPreparedMealRow } from './preparedMealRepository';

type CookingEventRow = Database['public']['Tables']['cooking_events']['Row'];
type CookingEventIngredientRow = Database['public']['Tables']['cooking_event_ingredients']['Row'];

function mapCookingEventRow(row: CookingEventRow): CookingEvent {
  return {
    id: row.id,
    recipeVersionId: row.recipe_version_id,
    mealPlanItemId: row.meal_plan_item_id ?? undefined,
    status: row.status,
    plannedServings: row.planned_servings,
    actualServingsPrepared: row.actual_servings_prepared ?? undefined,
    finalBatchWeightG: row.final_batch_weight_g ?? undefined,
    pantryDeductionStatus: row.pantry_deduction_status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function mapCookingEventIngredientRow(row: CookingEventIngredientRow): CookingEventIngredient {
  return {
    id: row.id,
    cookingEventId: row.cooking_event_id,
    recipeIngredientId: row.recipe_ingredient_id,
    pantryItemId: row.pantry_item_id ?? undefined,
    requestedQuantity: row.requested_quantity,
    requestedUnit: row.requested_unit ?? undefined,
    deductedQuantity: row.deducted_quantity,
    deductedUnit: row.deducted_unit ?? undefined,
    estimatedGrams: row.estimated_grams ?? undefined,
    matchConfidence: row.match_confidence ?? undefined,
    userConfirmed: row.user_confirmed,
    wasSkipped: row.was_skipped,
  };
}

/**
 * The ONLY way a cooking_events row is created - call this only in response
 * to an explicit "Start Cooking" press, never on route render/navigation.
 * idempotencyKey should be generated once (e.g. on first button press) and
 * reused for retries so a dropped response never creates a duplicate event.
 */
export async function startCookingEvent(params: {
  recipeVersionId: string;
  mealPlanItemId?: string;
  plannedServings?: number;
  idempotencyKey: string;
}): Promise<CookingEvent> {
  const { data, error } = await supabase.rpc('start_cooking_event', {
    p_recipe_version_id: params.recipeVersionId,
    p_meal_plan_item_id: params.mealPlanItemId ?? null,
    p_planned_servings: params.plannedServings ?? null,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw error;
  return mapCookingEventRow(data);
}

export async function cancelCookingEvent(cookingEventId: string, reason?: string): Promise<CookingEvent> {
  const { data, error } = await supabase.rpc('cancel_cooking_event', {
    p_cooking_event_id: cookingEventId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return mapCookingEventRow(data);
}

// The RPC's jsonb deductions payload is client-constructed, so it uses
// camelCase keys (unlike to_jsonb(row) output elsewhere, which is
// snake_case matching real column names) - complete_cooking_event's SQL
// reads these exact camelCase keys back out.
function mapDeductionForRpc(d: DeductionInput) {
  return {
    recipeIngredientId: d.recipeIngredientId,
    pantryItemId: d.pantryItemId ?? null,
    requestedQuantity: d.requestedQuantity ?? null,
    requestedUnit: d.requestedUnit ?? null,
    deductedQuantity: d.deductedQuantity,
    deductedUnit: d.deductedUnit ?? null,
    estimatedGrams: d.estimatedGrams ?? null,
    matchConfidence: d.matchConfidence ?? null,
    userConfirmed: d.userConfirmed,
    wasSkipped: d.wasSkipped,
  };
}

/**
 * The one atomic completion call: validates + applies every confirmed
 * deduction against live pantry stock, creates the prepared-meal balance,
 * optionally logs servings consumed now, and updates the linked plan item -
 * all in a single trusted database transaction. Throws (no partial effects)
 * if the event was already completed/cancelled, or if any single deduction
 * is invalid/insufficient/unconfirmed.
 */
export async function completeCookingEvent(params: {
  cookingEventId: string;
  actualServingsPrepared: number;
  deductions: DeductionInput[];
  finalBatchWeightG?: number;
  servingsConsumedNow: number;
  mealType?: string;
  notes?: string;
}): Promise<CompleteCookingEventResult> {
  const { data, error } = await supabase.rpc('complete_cooking_event', {
    p_cooking_event_id: params.cookingEventId,
    p_actual_servings_prepared: params.actualServingsPrepared,
    p_deductions: params.deductions.map(mapDeductionForRpc),
    p_final_batch_weight_g: params.finalBatchWeightG ?? null,
    p_servings_consumed_now: params.servingsConsumedNow,
    p_meal_type: params.mealType ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;

  const result = data as unknown as {
    cookingEvent: CookingEventRow;
    preparedMeal: Database['public']['Tables']['prepared_meals']['Row'];
    mealLog: Database['public']['Tables']['meal_logs']['Row'] | null;
    deductions: CookingEventIngredientRow[];
  };

  return {
    cookingEvent: mapCookingEventRow(result.cookingEvent),
    preparedMeal: mapPreparedMealRow(result.preparedMeal),
    mealLog: result.mealLog ? mapMealLogRow(result.mealLog) : undefined,
    deductions: result.deductions.map(mapCookingEventIngredientRow),
  };
}
