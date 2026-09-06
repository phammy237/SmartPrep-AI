import { supabase } from '../../client';
import {
  deleteUserIngredientOverride,
  fetchCanonicalIngredientNutrition,
  fetchUsdaFoodFromCache,
  fetchUserIngredientOverrides,
  invokeUsdaDetails,
  invokeUsdaSearch,
  upsertUserIngredientOverride,
} from '../nutritionReferenceRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() } },
}));

type Result = { data: unknown; error: unknown };

function makeChain(result: Result) {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  (chain as { then: unknown }).then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return chain;
}

const invoke = supabase.functions.invoke as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('fetchCanonicalIngredientNutrition', () => {
  it('returns [] without a query for an empty id list', async () => {
    expect(await fetchCanonicalIngredientNutrition([])).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('maps rows (per-100g basis, status, fdc id)', async () => {
    const chain = makeChain({
      data: [
        {
          canonical_ingredient_id: 'ing-chicken-breast',
          fdc_id: 171077,
          nutrition_per_100g: { calories: 165, proteinG: 31, junk: 'x' },
          status: 'verified',
          match_rule: 'manual_confirmed',
          verified_at: '2026-01-01T00:00:00.000Z',
          created_at: 'x',
          updated_at: 'x',
        },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const rows = await fetchCanonicalIngredientNutrition(['ing-chicken-breast']);
    expect(chain.in).toHaveBeenCalledWith('canonical_ingredient_id', ['ing-chicken-breast']);
    expect(rows[0]).toEqual({
      canonicalIngredientId: 'ing-chicken-breast',
      per100g: { calories: 165, proteinG: 31 },
      status: 'verified',
      fdcId: 171077,
      verifiedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('propagates a supabase error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: null, error: new Error('boom') }));
    await expect(fetchCanonicalIngredientNutrition(['x'])).rejects.toThrow('boom');
  });
});

describe('fetchUserIngredientOverrides', () => {
  it('maps nutrition + conversion metadata, dropping invalid values', async () => {
    const chain = makeChain({
      data: [
        {
          id: 'o1',
          user_id: 'u1',
          canonical_ingredient_id: 'ing-milk',
          nutrition_per_100g: { calories: 50 },
          grams_per_unit: { item: 240, bad: -1, worse: 'x' },
          density_g_per_ml: 1.03,
          note: 'my milk',
          created_at: 'x',
          updated_at: 'x',
        },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const rows = await fetchUserIngredientOverrides(['ing-milk']);
    expect(rows[0]).toEqual({
      canonicalIngredientId: 'ing-milk',
      per100g: { calories: 50 },
      conversionMeta: { gramsPerUnit: { item: 240 }, densityGPerMl: 1.03 },
      note: 'my milk',
    });
  });

  it('handles a null nutrition override (conversion-only)', async () => {
    const chain = makeChain({
      data: [
        { id: 'o1', user_id: 'u1', canonical_ingredient_id: 'ing-x', nutrition_per_100g: null, grams_per_unit: null, density_g_per_ml: 0.9, note: null, created_at: 'x', updated_at: 'x' },
      ],
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    const rows = await fetchUserIngredientOverrides();
    expect(rows[0].per100g).toBeNull();
    expect(rows[0].conversionMeta).toEqual({ densityGPerMl: 0.9 });
  });
});

describe('upsert / delete user override', () => {
  it('upserts on the (user_id, canonical_ingredient_id) conflict target', async () => {
    const chain = makeChain({
      data: { id: 'o1', user_id: 'u1', canonical_ingredient_id: 'ing-x', nutrition_per_100g: { calories: 10 }, grams_per_unit: null, density_g_per_ml: null, note: null, created_at: 'x', updated_at: 'x' },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await upsertUserIngredientOverride('u1', { canonicalIngredientId: 'ing-x', per100g: { calories: 10 } });
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', canonical_ingredient_id: 'ing-x', nutrition_per_100g: { calories: 10 } }),
      { onConflict: 'user_id,canonical_ingredient_id' },
    );
  });

  it('deletes by canonical ingredient id (RLS scopes to the caller)', async () => {
    const chain = makeChain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    await deleteUserIngredientOverride('ing-x');
    expect(chain.eq).toHaveBeenCalledWith('canonical_ingredient_id', 'ing-x');
  });
});

describe('fetchUsdaFoodFromCache', () => {
  it('returns null when not cached', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: null, error: null }));
    expect(await fetchUsdaFoodFromCache(999)).toBeNull();
  });

  it('maps a cached row', async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      makeChain({ data: { fdc_id: 171077, description: 'Chicken breast', data_type: 'SR Legacy', nutrition_per_100g: { calories: 165 }, fetched_at: 't' }, error: null }),
    );
    expect(await fetchUsdaFoodFromCache(171077)).toEqual({
      fdcId: 171077,
      description: 'Chicken breast',
      dataType: 'SR Legacy',
      per100g: { calories: 165 },
      fetchedAt: 't',
    });
  });
});

describe('Edge Function invocations', () => {
  it('invokeUsdaSearch calls the usda-lookup function with a search body', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', candidates: [] }, error: null });
    const r = await invokeUsdaSearch('chicken breast');
    expect(invoke).toHaveBeenCalledWith('usda-lookup', { body: { action: 'search', query: 'chicken breast' } });
    expect(r).toEqual({ status: 'ok', candidates: [] });
  });

  it('invokeUsdaDetails calls the function with a details body', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', food: { fdcId: 1, description: 'x', dataType: null, nutritionPer100g: {} } }, error: null });
    await invokeUsdaDetails(171077);
    expect(invoke).toHaveBeenCalledWith('usda-lookup', { body: { action: 'details', fdcId: 171077 } });
  });

  it('propagates an Edge Function transport error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('function failed') });
    await expect(invokeUsdaSearch('x')).rejects.toThrow('function failed');
  });
});
