import { correctMealLog, fetchMealLogs, quickAddMealLog, voidMealLog } from '@/lib/supabase/repositories';
import { MealLog, NutritionSnapshot } from '@/types';
import { requireUserId } from './requireUserId';

async function getMealLogs(startDate: string, endDate: string): Promise<MealLog[]> {
  const userId = await requireUserId();
  return fetchMealLogs(userId, startDate, endDate);
}

async function quickAdd(params: {
  mealType: string;
  nutrition: NutritionSnapshot;
  notes?: string;
  idempotencyKey: string;
  consumedAt?: string;
}): Promise<MealLog> {
  return quickAddMealLog(params);
}

/** Soft-void, no replacement - the UI's "Remove" action. */
async function voidLog(mealLogId: string, reason: string): Promise<MealLog> {
  return voidMealLog(mealLogId, reason);
}

/** Void + typed atomic replacement - the "Correct" action on a recent meal log. */
async function correctLog(params: {
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
  return correctMealLog(params);
}

export const mealLogService = {
  getMealLogs,
  quickAdd,
  voidLog,
  correctLog,
};
