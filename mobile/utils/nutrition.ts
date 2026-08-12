import { IngredientCategory, MacroPreference, NutritionFacts, NutritionGoals, WeightGoalDirection } from '@/types';

const EMPTY: NutritionFacts = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

export function sumNutrition(list: NutritionFacts[]): NutritionFacts {
  return list.reduce(
    (total, item) => ({
      calories: total.calories + item.calories,
      proteinG: total.proteinG + item.proteinG,
      carbsG: total.carbsG + item.carbsG,
      fatG: total.fatG + item.fatG,
      fiberG: total.fiberG + item.fiberG,
    }),
    EMPTY,
  );
}

export function scaleNutrition(facts: NutritionFacts, factor: number): NutritionFacts {
  return {
    calories: facts.calories * factor,
    proteinG: facts.proteinG * factor,
    carbsG: facts.carbsG * factor,
    fatG: facts.fatG * factor,
    fiberG: facts.fiberG * factor,
  };
}

/** ISO date `days` days from today - used for weight-goal target dates. */
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const WEIGHT_GOAL_DIRECTION_OPTIONS: { value: WeightGoalDirection; label: string }[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain weight' },
];

export const MACRO_PREFERENCE_OPTIONS: { value: MacroPreference; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'low_carb', label: 'Low Carb' },
  { value: 'high_protein', label: 'High Protein' },
];

export type NutritionPeriod = 'today' | 'week' | 'month';

/** Calendar days each period represents. Both consumed totals and goals are scaled to this same basis. */
export const NUTRITION_PERIOD_DAYS: Record<NutritionPeriod, number> = { today: 1, week: 7, month: 30 };

export type NutritionGoalTotals = Pick<NutritionGoals, 'dailyCalories' | 'proteinG' | 'carbsG' | 'fatG'>;

/**
 * Scopes today's/this week's nutrition to the requested period. "Month" is a calendar 30-day
 * period for both sides: consumed is the week's total scaled by 30/7 days, and the goal is the
 * daily goal times 30 - previously these used different bases (4.345 weeks vs. 30 days), which
 * meant the displayed percentage wasn't quite comparing like with like.
 */
export function scopeNutritionForPeriod(
  period: NutritionPeriod,
  todayTotal: NutritionFacts,
  weekTotal: NutritionFacts,
  dailyGoal: NutritionGoalTotals,
): { consumed: NutritionFacts; goal: NutritionGoalTotals } {
  const days = NUTRITION_PERIOD_DAYS[period];
  return {
    consumed: period === 'today' ? todayTotal : scaleNutrition(weekTotal, days / 7),
    goal: {
      dailyCalories: dailyGoal.dailyCalories * days,
      proteinG: dailyGoal.proteinG * days,
      carbsG: dailyGoal.carbsG * days,
      fatG: dailyGoal.fatG * days,
    },
  };
}

export function macroPercent(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.round((value / goal) * 100);
}

const MACRO_SPLITS: Record<MacroPreference, { protein: number; carbs: number; fat: number }> = {
  balanced: { protein: 0.3, carbs: 0.45, fat: 0.25 },
  low_carb: { protein: 0.35, carbs: 0.2, fat: 0.45 },
  high_protein: { protein: 0.4, carbs: 0.35, fat: 0.25 },
};

/** Derives macro gram targets from a daily-calorie goal using standard percentage splits. */
export function computeMacroGoals(dailyCalories: number, macroPreference: MacroPreference) {
  const split = MACRO_SPLITS[macroPreference];
  return {
    proteinG: Math.round((dailyCalories * split.protein) / 4),
    carbsG: Math.round((dailyCalories * split.carbs) / 4),
    fatG: Math.round((dailyCalories * split.fat) / 9),
    fiberG: Math.round((dailyCalories / 1000) * 14),
  };
}

/** Category-level (not per-item) storage guidance - a reasonable general tip, not a personalized AI claim. */
export const STORAGE_TIPS: Record<IngredientCategory, string> = {
  produce: 'Keep loosely wrapped in the crisper drawer; wash just before using to help it last longer.',
  protein: 'Keep in the coldest part of the fridge and use within a few days, or freeze if not using soon.',
  dairy: 'Store toward the back of the fridge where it stays coldest, not in the door.',
  pantry: 'Keep in a cool, dry, airtight container away from direct sunlight.',
  frozen: "Keep at 0°F (-18°C) or below; once thawed, don't refreeze.",
  other: 'Store according to the package instructions in a cool, dry place.',
};
