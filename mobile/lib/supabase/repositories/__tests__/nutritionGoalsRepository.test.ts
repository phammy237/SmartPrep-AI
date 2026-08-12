import { supabase } from '../../client';
import { fetchCurrentNutritionGoals, replaceNutritionGoals } from '../nutritionGoalsRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

type Chain = Record<string, jest.Mock> & { maybeSingle: jest.Mock };

function mockChain(resolvedValue: { data: unknown; error: unknown }): Chain {
  const chain = {} as Chain;
  (['select', 'eq', 'is'] as const).forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain.maybeSingle = jest.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

describe('fetchCurrentNutritionGoals', () => {
  it('only looks at the row with effective_end null (the current goal)', async () => {
    const chain = mockChain({
      data: {
        daily_calories: 2000,
        protein_min_g: 150,
        carbs_target_g: 200,
        fat_target_g: 60,
        fiber_target_g: 30,
        macro_preference: 'balanced',
        weight_goal_direction: 'maintain',
        weight_goal_target_lbs: 0,
        weight_goal_target_date: null,
      },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchCurrentNutritionGoals('user-1');

    expect(chain.is).toHaveBeenCalledWith('effective_end', null);
    expect(result).toEqual({
      nutritionGoals: { dailyCalories: 2000, macroPreference: 'balanced', proteinG: 150, carbsG: 200, fatG: 60, fiberG: 30 },
      weightGoal: { direction: 'maintain', targetLbs: 0, targetDate: '' },
    });
  });

  it('returns null when the user has no goals yet', async () => {
    const chain = mockChain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchCurrentNutritionGoals('user-1');

    expect(result).toBeNull();
  });
});

describe('replaceNutritionGoals', () => {
  it('calls the atomic RPC instead of doing a separate update+insert', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        daily_calories: 1800,
        protein_min_g: 130,
        carbs_target_g: 180,
        fat_target_g: 55,
        fiber_target_g: 25,
        macro_preference: 'high_protein',
        weight_goal_direction: 'lose',
        weight_goal_target_lbs: 10,
        weight_goal_target_date: '2026-12-01',
      },
      error: null,
    });

    const result = await replaceNutritionGoals({
      nutritionGoals: { dailyCalories: 1800, macroPreference: 'high_protein', proteinG: 130, carbsG: 180, fatG: 55, fiberG: 25 },
      weightGoal: { direction: 'lose', targetLbs: 10, targetDate: '2026-12-01' },
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      'replace_nutrition_goals',
      expect.objectContaining({ p_daily_calories: 1800, p_weight_goal_direction: 'lose' }),
    );
    expect(result.nutritionGoals.dailyCalories).toBe(1800);
    expect(result.weightGoal.targetDate).toBe('2026-12-01');
  });

  it('propagates RPC errors (e.g. so the immutability trigger surfaces clearly)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('rejected') });

    await expect(
      replaceNutritionGoals({
        nutritionGoals: { dailyCalories: 2000, macroPreference: 'balanced', proteinG: 150, carbsG: 200, fatG: 60, fiberG: 30 },
        weightGoal: { direction: 'maintain', targetLbs: 0, targetDate: '' },
      }),
    ).rejects.toThrow('rejected');
  });
});
