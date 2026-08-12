import { supabase } from '../../client';
import { fetchDietaryPreferences, upsertDietaryPreferences } from '../dietaryPreferencesRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn() },
}));

type Chain = Record<string, jest.Mock> & { maybeSingle: jest.Mock; single: jest.Mock };

function mockChain(resolvedValue: { data: unknown; error: unknown }): Chain {
  const chain = {} as Chain;
  (['select', 'eq', 'upsert'] as const).forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain.maybeSingle = jest.fn(() => Promise.resolve(resolvedValue));
  chain.single = jest.fn(() => Promise.resolve(resolvedValue));
  return chain;
}

const DEFAULT_PRIORITIES = {
  useWhatIHave: 50,
  reduceFoodWaste: 50,
  saveMoney: 50,
  eatHealthier: 50,
  cookQuickly: 50,
  tryNewFoods: 50,
};

describe('fetchDietaryPreferences', () => {
  it('returns null when no row exists yet (new user, pre-onboarding)', async () => {
    const chain = mockChain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchDietaryPreferences('user-1');

    expect(result).toBeNull();
    expect(supabase.from).toHaveBeenCalledWith('dietary_preferences');
  });

  it('maps a DB row into the app shape, defaulting null priorities/budget', async () => {
    const chain = mockChain({
      data: {
        user_id: 'user-1',
        dietary_patterns: ['vegan'],
        allergens: ['peanuts'],
        preferred_cuisines: ['thai'],
        excluded_ingredients: [],
        max_cook_time: 'under_15',
        priorities: null,
        weekly_grocery_budget: null,
      },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchDietaryPreferences('user-1');

    expect(result).toEqual({
      dietary: ['vegan'],
      allergies: ['peanuts'],
      favoriteCuisines: ['thai'],
      dislikedFoods: [],
      cookingTime: 'under_15',
      priorities: DEFAULT_PRIORITIES,
      weeklyGroceryBudget: 75,
    });
  });

  it('throws the underlying error instead of swallowing it', async () => {
    const chain = mockChain({ data: null, error: new Error('boom') });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(fetchDietaryPreferences('user-1')).rejects.toThrow('boom');
  });
});

describe('upsertDietaryPreferences', () => {
  it('sends a fully-shaped row keyed by user_id', async () => {
    const chain = mockChain({
      data: {
        user_id: 'user-1',
        dietary_patterns: ['vegetarian'],
        allergens: [],
        preferred_cuisines: [],
        excluded_ingredients: [],
        max_cook_time: 'no_preference',
        priorities: { ...DEFAULT_PRIORITIES, useWhatIHave: 80 },
        weekly_grocery_budget: 100,
      },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await upsertDietaryPreferences('user-1', {
      dietary: ['vegetarian'],
      allergies: [],
      favoriteCuisines: [],
      dislikedFoods: [],
      cookingTime: 'no_preference',
      priorities: { ...DEFAULT_PRIORITIES, useWhatIHave: 80 },
      weeklyGroceryBudget: 100,
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        dietary_patterns: ['vegetarian'],
        weekly_grocery_budget: 100,
      }),
    );
  });
});
