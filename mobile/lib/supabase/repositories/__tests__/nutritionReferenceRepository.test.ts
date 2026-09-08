import { supabase } from '../../client';
import {
  deleteUserIngredientOverride,
  fetchBarcodeProductNutrition,
  fetchCanonicalIngredientNutrition,
  fetchUsdaFoodFromCache,
  fetchUserIngredientOverrides,
  invokeUsdaBrandedByBarcode,
  invokeUsdaDetails,
  invokeUsdaSearch,
  upsertBarcodeProductCandidate,
  upsertUserIngredientOverride,
} from '../nutritionReferenceRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn(), functions: { invoke: jest.fn() }, rpc: jest.fn() },
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

describe('barcode product nutrition (migration 0013)', () => {
  const rpc = supabase.rpc as jest.Mock;

  const ROW = {
    id: 'bpn-1',
    barcode: '036000291452',
    provider: 'open_food_facts',
    source_product_id: '036000291452',
    nutrition_per_100g: { calories: 59, proteinG: 10, sodiumMg: -5, junk: 'x' },
    status: 'candidate',
    fdc_id: null,
    description: 'Vanilla yogurt',
    brand_owner: 'Oikos',
    source_fetched_at: '2026-09-05T00:00:00.000Z',
    created_by: 'user-1',
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
  };

  it('fetchBarcodeProductNutrition maps a row to a clean per-100g basis (drops negative / non-numeric)', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: ROW, error: null }));
    const ref = await fetchBarcodeProductNutrition('036000291452');
    expect(supabase.from).toHaveBeenCalledWith('barcode_product_nutrition');
    expect(ref).toMatchObject({ barcode: '036000291452', status: 'candidate', provider: 'open_food_facts', fdcId: null });
    expect(ref?.per100g).toEqual({ calories: 59, proteinG: 10 });
  });

  it('fetchBarcodeProductNutrition returns null when the barcode is not cached', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: null, error: null }));
    expect(await fetchBarcodeProductNutrition('000000000000')).toBeNull();
  });

  it('upsertBarcodeProductCandidate goes through the security-definer RPC (never a raw table write)', async () => {
    rpc.mockResolvedValue({ data: ROW, error: null });
    await upsertBarcodeProductCandidate({
      barcode: '036000291452',
      sourceProductId: '036000291452',
      per100g: { calories: 59, proteinG: 10 },
      description: 'Vanilla yogurt',
      brandOwner: 'Oikos',
    });
    expect(rpc).toHaveBeenCalledWith('upsert_barcode_product_candidate', {
      p_barcode: '036000291452',
      p_source_product_id: '036000291452',
      p_nutrition_per_100g: { calories: 59, proteinG: 10 },
      p_description: 'Vanilla yogurt',
      p_brand_owner: 'Oikos',
    });
    // no direct insert/update/upsert to the table
    expect(supabase.from).not.toHaveBeenCalledWith('barcode_product_nutrition');
  });

  it('invokeUsdaBrandedByBarcode calls the Edge Function with the branded_by_barcode action', async () => {
    invoke.mockResolvedValue({ data: { status: 'no_exact_match', barcode: '036000291452' }, error: null });
    const r = await invokeUsdaBrandedByBarcode('036000291452');
    expect(invoke).toHaveBeenCalledWith('usda-lookup', { body: { action: 'branded_by_barcode', barcode: '036000291452' } });
    expect(r).toEqual({ status: 'no_exact_match', barcode: '036000291452' });
  });

  it('passes through the persist_failed status (GTIN matched but the verified write did not land)', async () => {
    invoke.mockResolvedValue({ data: { status: 'persist_failed', barcode: '036000291452' }, error: null });
    expect(await invokeUsdaBrandedByBarcode('036000291452')).toEqual({ status: 'persist_failed', barcode: '036000291452' });
  });
});
