import { IngredientCategory, MacroPreference, NutritionFacts } from '@/types';

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
