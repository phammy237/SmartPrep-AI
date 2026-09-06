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
