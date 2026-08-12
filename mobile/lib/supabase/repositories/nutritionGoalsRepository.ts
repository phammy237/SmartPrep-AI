import { NutritionGoals, WeightGoal } from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';

type NutritionGoalsRowDb = Database['public']['Tables']['nutrition_goals']['Row'];

export interface NutritionGoalsRecord {
  nutritionGoals: NutritionGoals;
  weightGoal: WeightGoal;
}

function mapRow(row: NutritionGoalsRowDb): NutritionGoalsRecord {
  return {
    nutritionGoals: {
      dailyCalories: row.daily_calories,
      macroPreference: row.macro_preference,
      proteinG: row.protein_min_g,
      carbsG: row.carbs_target_g,
      fatG: row.fat_target_g,
      fiberG: row.fiber_target_g ?? 0,
    },
    weightGoal: {
      direction: row.weight_goal_direction ?? 'maintain',
      targetLbs: row.weight_goal_target_lbs ?? 0,
      targetDate: row.weight_goal_target_date ?? '',
    },
  };
}

export async function fetchCurrentNutritionGoals(userId: string): Promise<NutritionGoalsRecord | null> {
  const { data, error } = await supabase
    .from('nutrition_goals')
    .select('*')
    .eq('user_id', userId)
    .is('effective_end', null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/**
 * nutrition_goals rows are immutable history (enforced by a DB trigger) -
 * "replacing" goals always means closing out the current row and inserting a
 * new one, done atomically server-side via the replace_nutrition_goals RPC
 * so there's never a moment with zero current rows for this user.
 */
export async function replaceNutritionGoals(values: NutritionGoalsRecord): Promise<NutritionGoalsRecord> {
  const { data, error } = await supabase.rpc('replace_nutrition_goals', {
    p_daily_calories: values.nutritionGoals.dailyCalories,
    p_protein_min_g: values.nutritionGoals.proteinG,
    p_carbs_target_g: values.nutritionGoals.carbsG,
    p_fat_target_g: values.nutritionGoals.fatG,
    p_fiber_target_g: values.nutritionGoals.fiberG,
    p_macro_preference: values.nutritionGoals.macroPreference,
    p_weight_goal_direction: values.weightGoal.direction,
    p_weight_goal_target_lbs: values.weightGoal.targetLbs,
    p_weight_goal_target_date: values.weightGoal.targetDate || null,
  });
  if (error) throw error;
  return mapRow(data);
}
