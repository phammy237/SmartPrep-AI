import { cancelCookingEvent, completeCookingEvent, startCookingEvent } from '@/lib/supabase/repositories';
import { DeductionInput } from '@/lib/validation/cookingSchemas';
import { CompleteCookingEventResult, CookingEvent } from '@/types';

/** The only way a cooking_events row is created - call only from an explicit "Start Cooking" press, never on route render. */
async function startCooking(params: {
  recipeVersionId: string;
  mealPlanItemId?: string;
  plannedServings?: number;
  idempotencyKey: string;
}): Promise<CookingEvent> {
  return startCookingEvent(params);
}

async function cancelCooking(cookingEventId: string, reason?: string): Promise<CookingEvent> {
  return cancelCookingEvent(cookingEventId, reason);
}

async function finishCooking(params: {
  cookingEventId: string;
  actualServingsPrepared: number;
  deductions: DeductionInput[];
  finalBatchWeightG?: number;
  servingsConsumedNow: number;
  mealType?: string;
  notes?: string;
}): Promise<CompleteCookingEventResult> {
  return completeCookingEvent(params);
}

export const cookingService = {
  startCooking,
  cancelCooking,
  finishCooking,
};
