import { CreateMealPlanEntryInput, UpdateMealPlanEntryInput } from '@/lib/validation/plannerSchemas';
import { MEAL_PLAN_STATUS_VALUES, MEAL_TYPE_VALUES, MealPlanEntry, MealType } from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';
import { assertEnumValue } from './enumMappers';

type MealPlanItemRow = Database['public']['Tables']['meal_plan_items']['Row'];

function mapRow(row: MealPlanItemRow): MealPlanEntry {
  return {
    id: row.id,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time ?? undefined,
    timezone: row.timezone,
    mealSlot: assertEnumValue(MEAL_TYPE_VALUES, row.meal_slot, 'meal_plan_items.meal_slot'),
    recipeVersionId: row.recipe_version_id,
    plannedServings: row.planned_servings,
    status: assertEnumValue(MEAL_PLAN_STATUS_VALUES, row.status, 'meal_plan_items.status'),
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchMealPlanEntries(userId: string, startDate: string, endDate: string): Promise<MealPlanEntry[]> {
  const { data, error } = await supabase
    .from('meal_plan_items')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return data.map(mapRow);
}

export async function createMealPlanEntry(userId: string, input: CreateMealPlanEntryInput): Promise<MealPlanEntry> {
  const { data, error } = await supabase
    .from('meal_plan_items')
    .insert({
      user_id: userId,
      scheduled_date: input.scheduledDate,
      scheduled_time: input.scheduledTime ?? null,
      timezone: input.timezone,
      meal_slot: input.mealSlot,
      recipe_version_id: input.recipeVersionId,
      planned_servings: input.plannedServings,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

/** Planning or marking an entry completed never touches meal_logs - this is a plain single-table update. */
export async function updateMealPlanEntry(id: string, patch: UpdateMealPlanEntryInput): Promise<MealPlanEntry> {
  const { data, error } = await supabase
    .from('meal_plan_items')
    .update({
      ...(patch.scheduledDate !== undefined ? { scheduled_date: patch.scheduledDate } : {}),
      ...(patch.scheduledTime !== undefined ? { scheduled_time: patch.scheduledTime } : {}),
      ...(patch.mealSlot !== undefined ? { meal_slot: patch.mealSlot } : {}),
      ...(patch.recipeVersionId !== undefined ? { recipe_version_id: patch.recipeVersionId } : {}),
      ...(patch.plannedServings !== undefined ? { planned_servings: patch.plannedServings } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function deleteMealPlanEntry(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plan_items').delete().eq('id', id);
  if (error) throw error;
}

/** Used by "Generate My Week" to clear out only still-planned entries for a slot/range before regenerating - never touches completed/skipped/cancelled history. */
export async function deletePlannedEntriesInRange(
  userId: string,
  mealSlot: MealType,
  startDate: string,
  endDate: string,
): Promise<void> {
  const { error } = await supabase
    .from('meal_plan_items')
    .delete()
    .eq('user_id', userId)
    .eq('meal_slot', mealSlot)
    .eq('status', 'planned')
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate);
  if (error) throw error;
}
