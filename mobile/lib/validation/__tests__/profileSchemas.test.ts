import { computeMacroGoals } from '@/utils/nutrition';
import { dietaryPreferencesInputSchema, nutritionGoalsInputSchema } from '../profileSchemas';

const BASE_PRIORITIES = {
  useWhatIHave: 50,
  reduceFoodWaste: 50,
  saveMoney: 50,
  eatHealthier: 50,
  cookQuickly: 50,
  tryNewFoods: 50,
};

describe('dietaryPreferencesInputSchema', () => {
  it('accepts a valid onboarding-shaped payload', () => {
    const result = dietaryPreferencesInputSchema.safeParse({
      dietary: ['vegetarian'],
      allergies: ['peanuts'],
      favoriteCuisines: ['Thai'],
      dislikedFoods: [],
      cookingTime: '15_30',
      cookingConfidence: 3,
      priorities: BASE_PRIORITIES,
      weeklyGroceryBudget: 75,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range cooking confidence', () => {
    const result = dietaryPreferencesInputSchema.safeParse({
      dietary: [],
      allergies: [],
      favoriteCuisines: [],
      dislikedFoods: [],
      cookingTime: 'no_preference',
      cookingConfidence: 7,
      priorities: BASE_PRIORITIES,
      weeklyGroceryBudget: 75,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative grocery budget', () => {
    const result = dietaryPreferencesInputSchema.safeParse({
      dietary: [],
      allergies: [],
      favoriteCuisines: [],
      dislikedFoods: [],
      cookingTime: 'no_preference',
      cookingConfidence: 3,
      priorities: BASE_PRIORITIES,
      weeklyGroceryBudget: -10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown dietary pattern', () => {
    const result = dietaryPreferencesInputSchema.safeParse({
      dietary: ['carnivore'],
      allergies: [],
      favoriteCuisines: [],
      dislikedFoods: [],
      cookingTime: 'no_preference',
      cookingConfidence: 3,
      priorities: BASE_PRIORITIES,
      weeklyGroceryBudget: 75,
    });
    expect(result.success).toBe(false);
  });
});

describe('nutritionGoalsInputSchema', () => {
  it('accepts goals whose macros were derived by computeMacroGoals', () => {
    const macros = computeMacroGoals(2000, 'balanced');
    const result = nutritionGoalsInputSchema.safeParse({
      dailyCalories: 2000,
      macroPreference: 'balanced',
      ...macros,
      weightGoal: { direction: 'maintain', targetLbs: 0, targetDate: '2026-12-01' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a calorie target below the floor', () => {
    const macros = computeMacroGoals(2000, 'balanced');
    const result = nutritionGoalsInputSchema.safeParse({
      dailyCalories: 500,
      macroPreference: 'balanced',
      ...macros,
      weightGoal: { direction: 'maintain', targetLbs: 0, targetDate: '2026-12-01' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects macros that are wildly inconsistent with the calorie target', () => {
    const result = nutritionGoalsInputSchema.safeParse({
      dailyCalories: 2000,
      macroPreference: 'balanced',
      proteinG: 5,
      carbsG: 5,
      fatG: 5,
      fiberG: 20,
      weightGoal: { direction: 'maintain', targetLbs: 0, targetDate: '2026-12-01' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a negative weight-goal target', () => {
    const macros = computeMacroGoals(2000, 'balanced');
    const result = nutritionGoalsInputSchema.safeParse({
      dailyCalories: 2000,
      macroPreference: 'balanced',
      ...macros,
      weightGoal: { direction: 'lose', targetLbs: -5, targetDate: '2026-12-01' },
    });
    expect(result.success).toBe(false);
  });
});
