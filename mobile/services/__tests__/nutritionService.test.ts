import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { nutritionService } from '../nutritionService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchCanonicalIngredientNutrition: jest.fn(),
  fetchUserIngredientOverrides: jest.fn(),
  upsertUserIngredientOverride: jest.fn(),
  deleteUserIngredientOverride: jest.fn(),
  fetchUsdaFoodFromCache: jest.fn(),
  invokeUsdaSearch: jest.fn(),
  invokeUsdaDetails: jest.fn(),
  fetchBarcodeProductNutrition: jest.fn(),
  upsertBarcodeProductCandidate: jest.fn(),
  invokeUsdaBrandedByBarcode: jest.fn(),
}));

const repo = repositories as jest.Mocked<typeof repositories>;
const getUser = supabase.auth.getUser as jest.Mock;

// ing-chicken-breast in the real catalog carries per-100g + gramsPerUnit { item: 174 }.
const CHICKEN = 'ing-chicken-breast';

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  repo.fetchCanonicalIngredientNutrition.mockResolvedValue([]);
  repo.fetchUserIngredientOverrides.mockResolvedValue([]);
  repo.fetchBarcodeProductNutrition.mockResolvedValue(null);
});

function barcodeRow(over: Record<string, unknown> = {}) {
  return {
    barcode: '036000291452',
    provider: 'open_food_facts',
    sourceProductId: '036000291452',
    per100g: { calories: 59, proteinG: 10, carbsG: 3.6, fatG: 0 },
    status: 'candidate',
    fdcId: null,
    description: 'Greek yogurt, vanilla',
    brandOwner: 'Oikos',
    sourceFetchedAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z',
    ...over,
  } as unknown as NonNullable<Awaited<ReturnType<typeof repo.fetchBarcodeProductNutrition>>>;
}

describe('resolveQuantityNutrition - barcode product nutrition outranks canonical', () => {
  it('uses a persisted OFF candidate product record -> status "candidate", source note mentions Open Food Facts', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(barcodeRow());
    const out = await nutritionService.resolveQuantityNutrition({
      canonicalIngredientId: 'ing-barcode-xyz',
      quantity: 100,
      unit: 'g',
      barcode: '036000291452',
    });
    expect(out.status).toBe('candidate');
    if (out.status === 'candidate') {
      expect(out.snapshot.calories).toBe(59);
      expect(out.snapshot.uncertaintyNotes).toMatch(/Open Food Facts/);
    }
    expect(repo.fetchBarcodeProductNutrition).toHaveBeenCalledWith('036000291452');
    // never re-derives from the canonical ingredient once the product record covers it
    expect(repo.fetchCanonicalIngredientNutrition).not.toHaveBeenCalled();
  });

  it('a verified USDA product record -> status "verified", source "usda"', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(
      barcodeRow({ provider: 'usda', status: 'verified', fdcId: 2666511, per100g: { calories: 61, proteinG: 10.3 } }),
    );
    const out = await nutritionService.resolveQuantityNutrition({
      canonicalIngredientId: 'ing-milk',
      quantity: 100,
      unit: 'g',
      barcode: '036000291452',
    });
    expect(out.status).toBe('verified');
    expect(out.provenance.source).toBe('usda');
    // product-specific beats the generic canonical ingredient for a branded item
    expect(repo.fetchCanonicalIngredientNutrition).not.toHaveBeenCalled();
  });

  it('a barcode with NO product record falls through to the canonical path', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(null);
    await nutritionService.resolveQuantityNutrition({
      canonicalIngredientId: CHICKEN,
      quantity: 100,
      unit: 'g',
      barcode: '036000291452',
    });
    expect(repo.fetchCanonicalIngredientNutrition).toHaveBeenCalledWith([CHICKEN]);
  });

  it('an empty product record (no known nutrient) falls through to canonical', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(barcodeRow({ per100g: {} }));
    await nutritionService.resolveQuantityNutrition({
      canonicalIngredientId: CHICKEN,
      quantity: 100,
      unit: 'g',
      barcode: '036000291452',
    });
    expect(repo.fetchCanonicalIngredientNutrition).toHaveBeenCalled();
  });

  it('no barcode -> product cache is never consulted (ordinary ingredient path unchanged)', async () => {
    await nutritionService.resolveQuantityNutrition({ canonicalIngredientId: CHICKEN, quantity: 100, unit: 'g' });
    expect(repo.fetchBarcodeProductNutrition).not.toHaveBeenCalled();
  });

  it('requires auth', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      nutritionService.resolveQuantityNutrition({ canonicalIngredientId: CHICKEN, quantity: 1, unit: 'g', barcode: '036000291452' }),
    ).rejects.toThrow('Not signed in');
    expect(repo.fetchBarcodeProductNutrition).not.toHaveBeenCalled();
  });
});

describe('enrichBarcodeProductNutrition - OFF-independent + verified-means-persisted', () => {
  const BARCODE = '036000291452';
  const verifiedRow = (over: Record<string, unknown> = {}) =>
    barcodeRow({ provider: 'usda', status: 'verified', fdcId: 2666511, per100g: { calories: 61, proteinG: 10.3 }, ...over });

  it('OFF found + USDA no exact -> persists + reports the OFF candidate', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(null);
    repo.upsertBarcodeProductCandidate.mockResolvedValue(barcodeRow());
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({ status: 'no_exact_match', barcode: BARCODE });

    const out = await nutritionService.enrichBarcodeProductNutrition({
      barcode: BARCODE,
      offPer100g: { calories: 59, proteinG: 10, carbsG: 3.6, fatG: 0, fiberG: null, sugarG: null, sodiumMg: null },
    });

    expect(repo.upsertBarcodeProductCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: BARCODE, per100g: { calories: 59, proteinG: 10, carbsG: 3.6, fatG: 0 } }),
    );
    expect(repo.invokeUsdaBrandedByBarcode).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ status: 'candidate', source: 'open_food_facts', fdcId: null });
  });

  it('OFF found + USDA exact + persisted verified row readable back -> verified with fdc_id', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValueOnce(null).mockResolvedValueOnce(verifiedRow());
    repo.upsertBarcodeProductCandidate.mockResolvedValue(barcodeRow());
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({
      status: 'verified_match', barcode: BARCODE, fdcId: 2666511, description: 'OIKOS', brandOwner: 'Danone',
      nutritionPer100g: { calories: 61, proteinG: 10.3 },
    });

    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 59 } });
    expect(out).toMatchObject({ status: 'verified', source: 'usda', fdcId: 2666511 });
    expect(out.per100g?.calories).toBe(61);
  });

  it('USDA says verified_match but NO persisted verified row -> NOT verified (OFF candidate stands, fdcId null)', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(null); // up-front check AND the read-back
    repo.upsertBarcodeProductCandidate.mockResolvedValue(barcodeRow());
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({
      status: 'verified_match', barcode: BARCODE, fdcId: 2666511, description: 'x', brandOwner: null,
      nutritionPer100g: { calories: 61 },
    });

    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 59 } });
    expect(out).toMatchObject({ status: 'candidate', source: 'open_food_facts', fdcId: null });
  });

  it('Edge Function reports persist_failed -> NOT verified, OFF candidate stands, no fdcId', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(null);
    repo.upsertBarcodeProductCandidate.mockResolvedValue(barcodeRow());
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({ status: 'persist_failed', barcode: BARCODE });

    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 59 } });
    expect(out).toMatchObject({ status: 'candidate', fdcId: null });
  });

  it('OFF not_found + USDA exact (persisted) -> verified, name/brand from USDA, no OFF candidate written', async () => {
    repo.fetchBarcodeProductNutrition
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(verifiedRow({ description: 'OIKOS TRIPLE ZERO VANILLA', brandOwner: 'Danone' }));
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({
      status: 'verified_match', barcode: BARCODE, fdcId: 2666511, description: 'OIKOS TRIPLE ZERO VANILLA', brandOwner: 'Danone',
      nutritionPer100g: { calories: 61 },
    });

    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: null });
    expect(repo.upsertBarcodeProductCandidate).not.toHaveBeenCalled();
    expect(repo.invokeUsdaBrandedByBarcode).toHaveBeenCalledTimes(1); // USDA attempted despite OFF miss
    expect(out).toMatchObject({ status: 'verified', source: 'usda', fdcId: 2666511 });
    expect(out.description).toBe('OIKOS TRIPLE ZERO VANILLA');
  });

  it('OFF not_found + USDA no exact -> unresolved (blank manual path), nothing persisted, no throw', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(null);
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({ status: 'no_exact_match', barcode: BARCODE });
    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: null });
    expect(repo.upsertBarcodeProductCandidate).not.toHaveBeenCalled();
    expect(out).toEqual({ status: 'unresolved', source: 'none', per100g: null, fdcId: null });
  });

  it('OFF provider failure (no offPer100g) + USDA exact still verifies independently', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValueOnce(null).mockResolvedValueOnce(verifiedRow());
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({
      status: 'verified_match', barcode: BARCODE, fdcId: 2666511, description: 'x', brandOwner: null,
      nutritionPer100g: { calories: 61 },
    });
    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: undefined });
    expect(out).toMatchObject({ status: 'verified', fdcId: 2666511 });
  });

  it('a USDA transport error never blocks - the OFF candidate still stands', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(null);
    repo.upsertBarcodeProductCandidate.mockResolvedValue(barcodeRow());
    repo.invokeUsdaBrandedByBarcode.mockRejectedValue(new Error('rate limited'));
    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 59 } });
    expect(out.status).toBe('candidate');
  });

  it('an existing PERSISTED verified row short-circuits - no USDA call, no candidate upsert', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(verifiedRow());
    const out = await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 59 } });
    expect(out).toMatchObject({ status: 'verified', source: 'usda', fdcId: 2666511 });
    expect(repo.invokeUsdaBrandedByBarcode).not.toHaveBeenCalled();
    expect(repo.upsertBarcodeProductCandidate).not.toHaveBeenCalled();
  });

  it('an existing CANDIDATE row does NOT short-circuit USDA (still tries to upgrade)', async () => {
    repo.fetchBarcodeProductNutrition.mockResolvedValue(barcodeRow());
    repo.upsertBarcodeProductCandidate.mockResolvedValue(barcodeRow());
    repo.invokeUsdaBrandedByBarcode.mockResolvedValue({ status: 'no_exact_match', barcode: BARCODE });
    await nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 59 } });
    expect(repo.invokeUsdaBrandedByBarcode).toHaveBeenCalledTimes(1);
  });

  it('requires auth (no provider calls when unauthenticated)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      nutritionService.enrichBarcodeProductNutrition({ barcode: BARCODE, offPer100g: { calories: 1 } }),
    ).rejects.toThrow('Not signed in');
    expect(repo.invokeUsdaBrandedByBarcode).not.toHaveBeenCalled();
  });
});

describe('auth gating', () => {
  it('every method throws before any repository call when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(nutritionService.resolveIngredientReference(CHICKEN)).rejects.toThrow('Not signed in');
    await expect(nutritionService.searchUsda('x')).rejects.toThrow('Not signed in');
    await expect(nutritionService.getUsdaFood(1)).rejects.toThrow('Not signed in');
    await expect(nutritionService.setIngredientOverride({ canonicalIngredientId: 'x' })).rejects.toThrow('Not signed in');
    expect(repo.fetchCanonicalIngredientNutrition).not.toHaveBeenCalled();
    expect(repo.invokeUsdaSearch).not.toHaveBeenCalled();
  });
});

describe('resolveIngredientReference - source precedence', () => {
  it('falls back to the catalog estimate (with catalog conversion meta) when the DB has nothing', async () => {
    const { reference, conversionMeta } = await nutritionService.resolveIngredientReference(CHICKEN);
    expect(reference.source).toBe('catalog_estimate');
    expect(reference.status).toBe('estimated');
    expect(reference.per100g?.proteinG).toBe(31);
    expect(conversionMeta.gramsPerUnit).toMatchObject({ item: 174 });
  });

  it('a verified server row (with fdc id) beats the catalog estimate', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165, proteinG: 31 }, status: 'verified', fdcId: 171077, verifiedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { reference } = await nutritionService.resolveIngredientReference(CHICKEN);
    expect(reference).toMatchObject({ source: 'usda', status: 'verified', fdcId: 171077 });
  });

  it('a user override with nutrition beats the server row', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165 }, status: 'verified', fdcId: 171077, verifiedAt: 't' },
    ]);
    repo.fetchUserIngredientOverrides.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 200, proteinG: 40 }, conversionMeta: { gramsPerUnit: { item: 190 } }, note: null },
    ]);
    const { reference, conversionMeta } = await nutritionService.resolveIngredientReference(CHICKEN);
    expect(reference).toMatchObject({ source: 'user_override', status: 'estimated', per100g: { calories: 200, proteinG: 40 } });
    // override conversion meta merges over the catalog's
    expect(conversionMeta.gramsPerUnit).toMatchObject({ item: 190 });
  });

  it('a conversion-only override does NOT change the nutrition reference, only the conversion meta', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165, proteinG: 31 }, status: 'candidate', fdcId: 555, verifiedAt: null },
    ]);
    repo.fetchUserIngredientOverrides.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: null, conversionMeta: { densityGPerMl: 0.9 }, note: null },
    ]);
    const { reference, conversionMeta } = await nutritionService.resolveIngredientReference(CHICKEN);
    expect(reference).toMatchObject({ source: 'usda', status: 'candidate' });
    expect(conversionMeta.densityGPerMl).toBe(0.9);
  });
});

describe('resolveQuantityNutrition - full pipeline', () => {
  it('verified server row + gram quantity -> verified snapshot', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 }, status: 'verified', fdcId: 171077, verifiedAt: 't' },
    ]);
    const r = await nutritionService.resolveQuantityNutrition({ canonicalIngredientId: CHICKEN, quantity: 200, unit: 'g' });
    expect(r.status).toBe('verified');
    if (r.status === 'unresolved') throw new Error('unexpected');
    expect(r.grams).toBe(200);
    expect(r.snapshot.calories).toBe(330);
  });

  it('count quantity resolves via catalog per-unit weight', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165 }, status: 'verified', fdcId: 171077, verifiedAt: 't' },
    ]);
    const r = await nutritionService.resolveQuantityNutrition({ canonicalIngredientId: CHICKEN, quantity: 2, unit: 'item' });
    if (r.status === 'unresolved') throw new Error('unexpected');
    expect(r.grams).toBe(348);
    expect(r.provenance.conversionMethod).toBe('per_unit_weight');
  });

  it('an unknown ingredient in an unconvertible unit stays unresolved - never a fabricated snapshot', async () => {
    const r = await nutritionService.resolveQuantityNutrition({ canonicalIngredientId: 'ing-not-real', quantity: 2, unit: 'item' });
    expect(r.status).toBe('unresolved');
    expect(r.snapshot).toBeNull();
  });

  it('a resolvable gram quantity with no reference anywhere stays unresolved', async () => {
    const r = await nutritionService.resolveQuantityNutrition({ canonicalIngredientId: 'ing-not-real', quantity: 100, unit: 'g' });
    expect(r).toMatchObject({ status: 'unresolved', reason: 'no_nutrition_reference', snapshot: null });
  });
});

describe('getUsdaFood - cache first', () => {
  it('returns the cached row without invoking the Edge Function', async () => {
    repo.fetchUsdaFoodFromCache.mockResolvedValue({
      fdcId: 171077,
      description: 'Chicken breast',
      dataType: 'SR Legacy',
      per100g: { calories: 165 },
      fetchedAt: 't',
    });
    const r = await nutritionService.getUsdaFood(171077);
    expect(r).toEqual({ status: 'ok', food: { fdcId: 171077, description: 'Chicken breast', dataType: 'SR Legacy', nutritionPer100g: { calories: 165 } } });
    expect(repo.invokeUsdaDetails).not.toHaveBeenCalled();
  });

  it('falls through to the Edge Function on a cache miss', async () => {
    repo.fetchUsdaFoodFromCache.mockResolvedValue(null);
    repo.invokeUsdaDetails.mockResolvedValue({ status: 'ok', food: { fdcId: 5, description: 'x', dataType: null, nutritionPer100g: {} } });
    await nutritionService.getUsdaFood(5);
    expect(repo.invokeUsdaDetails).toHaveBeenCalledWith(5);
  });

  it('propagates an Edge Function failure (no silent fallback)', async () => {
    repo.fetchUsdaFoodFromCache.mockResolvedValue(null);
    repo.invokeUsdaDetails.mockRejectedValue(new Error('function down'));
    await expect(nutritionService.getUsdaFood(5)).rejects.toThrow('function down');
  });
});

describe('searchUsda / overrides', () => {
  it('searchUsda delegates to the repository', async () => {
    repo.invokeUsdaSearch.mockResolvedValue({ status: 'no_match', candidates: [] });
    expect(await nutritionService.searchUsda('kale')).toEqual({ status: 'no_match', candidates: [] });
    expect(repo.invokeUsdaSearch).toHaveBeenCalledWith('kale');
  });

  it('setIngredientOverride passes the authenticated user id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'the-user' } }, error: null });
    repo.upsertUserIngredientOverride.mockResolvedValue({ canonicalIngredientId: 'ing-x', per100g: null, conversionMeta: {}, note: null });
    await nutritionService.setIngredientOverride({ canonicalIngredientId: 'ing-x', densityGPerMl: 0.9 });
    expect(repo.upsertUserIngredientOverride).toHaveBeenCalledWith('the-user', { canonicalIngredientId: 'ing-x', densityGPerMl: 0.9 });
  });
});

describe('getConversionMetaMap', () => {
  it('merges catalog conversion metadata with user overrides (override wins per key)', async () => {
    repo.fetchUserIngredientOverrides.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: null, conversionMeta: { gramsPerUnit: { item: 190 } }, note: null },
    ]);

    const map = await nutritionService.getConversionMetaMap([CHICKEN, 'ing-milk']);

    // chicken: catalog has { item: 174 }, override replaces with { item: 190 }
    expect(map.get(CHICKEN)?.gramsPerUnit).toMatchObject({ item: 190 });
    // milk: catalog density only, no override
    expect(map.get('ing-milk')?.densityGPerMl).toBeGreaterThan(0);
  });

  it('omits ingredients that have no conversion metadata at all', async () => {
    const map = await nutritionService.getConversionMetaMap(['ing-basil']); // basil has no gramsPerUnit / density
    expect(map.has('ing-basil')).toBe(false);
  });

  it('requires a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(nutritionService.getConversionMetaMap([CHICKEN])).rejects.toThrow('Not signed in');
  });
});

describe('getRecipeNutritionCoverage', () => {
  it('full coverage + all verified -> status verified, resolved == total', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165, proteinG: 31 }, status: 'verified', fdcId: 171077, verifiedAt: 't' },
      { canonicalIngredientId: 'ing-rice', per100g: { calories: 365, proteinG: 7 }, status: 'verified', fdcId: 1, verifiedAt: 't' },
    ]);

    const cov = await nutritionService.getRecipeNutritionCoverage([
      { ingredientId: CHICKEN, quantity: 200, unit: 'g' },
      { ingredientId: 'ing-rice', quantity: 100, unit: 'g' },
    ]);
    expect(cov).toMatchObject({ totalCount: 2, resolvedCount: 2, isPartial: false, status: 'verified' });
    expect(cov.totals.calories).toBe(330 + 365);
  });

  it('an unresolvable ingredient -> partial coverage, status incomplete (never "verified")', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([
      { canonicalIngredientId: CHICKEN, per100g: { calories: 165 }, status: 'verified', fdcId: 1, verifiedAt: 't' },
    ]);

    const cov = await nutritionService.getRecipeNutritionCoverage([
      { ingredientId: CHICKEN, quantity: 200, unit: 'g' },
      { ingredientId: 'ing-basil', quantity: 5, unit: 'g' }, // grams resolve, but basil has no nutrition reference anywhere
    ]);
    expect(cov.resolvedCount).toBe(1);
    expect(cov.unresolvedIngredientIds).toContain('ing-basil');
    expect(cov.isPartial).toBe(true);
    expect(cov.status).toBe('incomplete');
  });

  it('all resolved but only estimated -> status estimated', async () => {
    repo.fetchCanonicalIngredientNutrition.mockResolvedValue([]); // fall back to catalog estimates
    const cov = await nutritionService.getRecipeNutritionCoverage([
      { ingredientId: CHICKEN, quantity: 100, unit: 'g' },
    ]);
    expect(cov).toMatchObject({ resolvedCount: 1, isPartial: false, status: 'estimated' });
  });

  it('zero coverage -> status estimated with null totals (never fabricated)', async () => {
    const cov = await nutritionService.getRecipeNutritionCoverage([
      { ingredientId: 'ing-unknown-x', quantity: 1, unit: 'bag' },
    ]);
    expect(cov.resolvedCount).toBe(0);
    expect(cov.totals.calories).toBeNull();
  });
});
