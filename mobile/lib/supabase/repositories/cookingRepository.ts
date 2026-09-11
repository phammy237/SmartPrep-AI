import { DeductionInput } from '@/lib/validation/cookingSchemas';
import {
  COOKING_EVENT_STATUS_VALUES,
  CompleteCookingEventResult,
  CookingEvent,
  CookingEventIngredient,
  MATCH_CONFIDENCE_VALUES,
  PANTRY_DEDUCTION_STATUS_VALUES,
} from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';
import { assertEnumValue, parseNullableEnumValue } from './enumMappers';
import { mapMealLogRow } from './mealLogRepository';
import { mapPreparedMealRow } from './preparedMealRepository';

type CookingEventRow = Database['public']['Tables']['cooking_events']['Row'];
type CookingEventIngredientRow = Database['public']['Tables']['cooking_event_ingredients']['Row'];

function mapCookingEventRow(row: CookingEventRow): CookingEvent {
  return {
    id: row.id,
    recipeVersionId: row.recipe_version_id,
    mealPlanItemId: row.meal_plan_item_id ?? undefined,
    status: assertEnumValue(COOKING_EVENT_STATUS_VALUES, row.status, 'cooking_events.status'),
    plannedServings: row.planned_servings,
    actualServingsPrepared: row.actual_servings_prepared ?? undefined,
    finalBatchWeightG: row.final_batch_weight_g ?? undefined,
    pantryDeductionStatus: assertEnumValue(
      PANTRY_DEDUCTION_STATUS_VALUES,
      row.pantry_deduction_status,
      'cooking_events.pantry_deduction_status',
    ),
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
    matchConfidence: parseNullableEnumValue(
      MATCH_CONFIDENCE_VALUES,
      row.match_confidence,
      'cooking_event_ingredients.match_confidence',
    ),
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
  // p_meal_plan_item_id / p_planned_servings are `DEFAULT NULL` SQL params
  // (migration 0003) - omitting them is identical to sending SQL NULL.
  const { data, error } = await supabase.rpc('start_cooking_event', {
    p_recipe_version_id: params.recipeVersionId,
    p_idempotency_key: params.idempotencyKey,
    ...(params.mealPlanItemId != null ? { p_meal_plan_item_id: params.mealPlanItemId } : {}),
    ...(params.plannedServings != null ? { p_planned_servings: params.plannedServings } : {}),
  });
  if (error) throw error;
  return mapCookingEventRow(data);
}

export async function cancelCookingEvent(cookingEventId: string, reason?: string): Promise<CookingEvent> {
  // p_reason is a `DEFAULT NULL` SQL param (migration 0003).
  const { data, error } = await supabase.rpc('cancel_cooking_event', {
    p_cooking_event_id: cookingEventId,
    ...(reason != null ? { p_reason: reason } : {}),
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
  // p_final_batch_weight_g / p_meal_type / p_notes are `DEFAULT NULL` SQL
  // params (migration 0003) - omitting is identical to sending SQL NULL.
  const { data, error } = await supabase.rpc('complete_cooking_event', {
    p_cooking_event_id: params.cookingEventId,
    p_actual_servings_prepared: params.actualServingsPrepared,
    p_deductions: params.deductions.map(mapDeductionForRpc),
    p_servings_consumed_now: params.servingsConsumedNow,
    ...(params.finalBatchWeightG != null ? { p_final_batch_weight_g: params.finalBatchWeightG } : {}),
    ...(params.mealType != null ? { p_meal_type: params.mealType } : {}),
    ...(params.notes != null ? { p_notes: params.notes } : {}),
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
