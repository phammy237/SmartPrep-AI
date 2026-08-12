import { z } from 'zod';

export const dietaryPatternSchema = z.enum([
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'kosher',
  'gluten_free',
  'dairy_free',
  'none',
]);

export const cookingTimeSchema = z.enum(['under_15', '15_30', '30_60', 'no_preference']);

export const macroPreferenceSchema = z.enum(['balanced', 'low_carb', 'high_protein']);

export const weightGoalDirectionSchema = z.enum(['lose', 'maintain', 'gain']);

const shortTag = z.string().trim().min(1).max(60);

export const dietaryPreferencesInputSchema = z.object({
  dietary: z.array(dietaryPatternSchema),
  allergies: z.array(shortTag).max(50),
  favoriteCuisines: z.array(shortTag).max(50),
  dislikedFoods: z.array(shortTag).max(50),
  cookingTime: cookingTimeSchema,
  cookingConfidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  priorities: z.object({
    useWhatIHave: z.number().min(0).max(100),
    reduceFoodWaste: z.number().min(0).max(100),
    saveMoney: z.number().min(0).max(100),
    eatHealthier: z.number().min(0).max(100),
    cookQuickly: z.number().min(0).max(100),
    tryNewFoods: z.number().min(0).max(100),
  }),
  weeklyGroceryBudget: z.number().min(0).max(2000),
});

export const nutritionGoalsInputSchema = z
  .object({
    dailyCalories: z
      .number()
      .int()
      .min(800, 'Daily calories must be at least 800')
      .max(10000, 'That calorie target looks too high'),
    macroPreference: macroPreferenceSchema,
    proteinG: z.number().min(0),
    carbsG: z.number().min(0),
    fatG: z.number().min(0),
    fiberG: z.number().min(0),
    weightGoal: z.object({
      direction: weightGoalDirectionSchema,
      targetLbs: z.number().min(0).max(500),
      targetDate: z.string(),
    }),
  })
  .refine(
    (goal) => {
      // Macro grams are derived from dailyCalories (see utils/nutrition.ts
      // computeMacroGoals), not typed by the user, so this guards against
      // internal drift rather than being user-facing validation - a generous
      // tolerance avoids rejecting values that only differ by rounding.
      const impliedCalories = goal.proteinG * 4 + goal.carbsG * 4 + goal.fatG * 9;
      return Math.abs(impliedCalories - goal.dailyCalories) <= goal.dailyCalories * 0.15;
    },
    {
      message: 'Protein, carb, and fat targets are inconsistent with the daily calorie target',
      path: ['dailyCalories'],
    },
  );

export type DietaryPreferencesInput = z.infer<typeof dietaryPreferencesInputSchema>;
export type NutritionGoalsInput = z.infer<typeof nutritionGoalsInputSchema>;
