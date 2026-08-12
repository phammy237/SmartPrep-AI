import { NutritionFacts } from '@/types';
import { NUTRITION_PERIOD_DAYS, NutritionPeriod, scaleNutrition, scopeNutritionForPeriod } from '../nutrition';

describe('scaleNutrition', () => {
  it('scales every field by the given factor', () => {
    const facts: NutritionFacts = { calories: 100, proteinG: 10, carbsG: 20, fatG: 5, fiberG: 2 };
    expect(scaleNutrition(facts, 2)).toEqual({ calories: 200, proteinG: 20, carbsG: 40, fatG: 10, fiberG: 4 });
  });
});

describe('scopeNutritionForPeriod', () => {
  // Week totals are exact multiples of 7 so the 30/7 month factor produces clean, exact numbers.
  const today: NutritionFacts = { calories: 550, proteinG: 45, carbsG: 60, fatG: 18, fiberG: 8 };
  const week: NutritionFacts = { calories: 700, proteinG: 70, carbsG: 84, fatG: 21, fiberG: 14 };
  const dailyGoal = { dailyCalories: 2000, proteinG: 150, carbsG: 250, fatG: 65 };

  it('today: consumed is exactly today\'s total, goal is the unscaled daily goal', () => {
    const result = scopeNutritionForPeriod('today', today, week, dailyGoal);
    expect(result.consumed).toEqual(today);
    expect(result.goal).toEqual(dailyGoal);
  });

  it('week: consumed is exactly the week total, goal is 7x the daily goal', () => {
    const result = scopeNutritionForPeriod('week', today, week, dailyGoal);
    expect(result.consumed).toEqual(week);
    expect(result.goal).toEqual({ dailyCalories: 14000, proteinG: 1050, carbsG: 1750, fatG: 455 });
  });

  it('month: consumed and goal both use the same calendar 30-day basis, not 4.345 weeks', () => {
    const result = scopeNutritionForPeriod('month', today, week, dailyGoal);
    // week total scaled by 30/7 days - matches the goal's *30 basis exactly, instead of the old
    // 4.345-weeks approximation (700 * 4.345 = 3041.5, which disagreed with a *30 goal).
    expect(result.consumed).toEqual({ calories: 3000, proteinG: 300, carbsG: 360, fatG: 90, fiberG: 60 });
    expect(result.goal).toEqual({ dailyCalories: 60000, proteinG: 4500, carbsG: 7500, fatG: 1950 });
  });

  it('scales the goal by the same day count declared in NUTRITION_PERIOD_DAYS for every period', () => {
    (Object.keys(NUTRITION_PERIOD_DAYS) as NutritionPeriod[]).forEach((period) => {
      const days = NUTRITION_PERIOD_DAYS[period];
      const { goal } = scopeNutritionForPeriod(period, today, week, dailyGoal);
      expect(goal.dailyCalories).toBe(dailyGoal.dailyCalories * days);
      expect(goal.proteinG).toBe(dailyGoal.proteinG * days);
      expect(goal.carbsG).toBe(dailyGoal.carbsG * days);
      expect(goal.fatG).toBe(dailyGoal.fatG * days);
    });
  });
});
