import { NutritionReference } from '../nutritionReference';
import { ResolveIngredientReferenceFn, computeRecipeNutritionCoverage } from '../recipeNutrition';

const verified = (per100g: NutritionReference['per100g']): NutritionReference => ({
  status: 'verified',
  source: 'usda',
  per100g,
  fdcId: 1,
  verifiedAt: '2026-01-01T00:00:00.000Z',
});
const estimated = (per100g: NutritionReference['per100g']): NutritionReference => ({
  status: 'estimated',
  source: 'catalog_estimate',
  per100g,
});
const none: NutritionReference = { status: 'none', source: 'none', per100g: null };

function lookup(map: Record<string, { reference: NutritionReference; conversionMeta?: any }>): ResolveIngredientReferenceFn {
  return (id) => map[id] ?? { reference: none };
}

describe('computeRecipeNutritionCoverage', () => {
  it('sums resolved ingredients and reports full coverage + verified when all are verified', () => {
    const result = computeRecipeNutritionCoverage(
      [
        { ingredientId: 'chicken', quantity: 200, unit: 'g' },
        { ingredientId: 'rice', quantity: 100, unit: 'g' },
      ],
      lookup({
        chicken: { reference: verified({ calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 }) },
        rice: { reference: verified({ calories: 365, proteinG: 7.1, carbsG: 80, fatG: 0.7 }) },
      }),
    );

    expect(result.totalCount).toBe(2);
    expect(result.resolvedCount).toBe(2);
    expect(result.unresolvedIngredientIds).toEqual([]);
    expect(result.isPartial).toBe(false);
    expect(result.status).toBe('verified');
    expect(result.totals.calories).toBe(330 + 365);
    expect(result.totals.proteinG).toBe(62 + 7.1);
  });

  it('reports partial coverage and never claims verified when an ingredient is unresolved', () => {
    const result = computeRecipeNutritionCoverage(
      [
        { ingredientId: 'chicken', quantity: 200, unit: 'g' },
        { ingredientId: 'mystery-spice', quantity: 2, unit: 'item' }, // no per-unit weight -> unresolved
        { ingredientId: 'oil', quantity: 1, unit: 'cup' }, // no density -> unresolved
      ],
      lookup({
        chicken: { reference: verified({ calories: 165, proteinG: 31 }) },
        'mystery-spice': { reference: verified({ calories: 300 }) },
        oil: { reference: verified({ calories: 884 }) },
      }),
    );

    expect(result.resolvedCount).toBe(1);
    expect(result.unresolvedIngredientIds.sort()).toEqual(['mystery-spice', 'oil']);
    expect(result.isPartial).toBe(true);
    expect(result.status).toBe('incomplete');
    expect(result.totals.calories).toBe(330);
  });

  it('is estimated (not verified) when every ingredient resolves but some are only estimates', () => {
    const result = computeRecipeNutritionCoverage(
      [
        { ingredientId: 'a', quantity: 100, unit: 'g' },
        { ingredientId: 'b', quantity: 100, unit: 'g' },
      ],
      lookup({
        a: { reference: verified({ calories: 100 }) },
        b: { reference: estimated({ calories: 200 }) },
      }),
    );
    expect(result.isPartial).toBe(false);
    expect(result.status).toBe('estimated');
    expect(result.totals.calories).toBe(300);
  });

  it('a nutrient unknown in ALL resolved ingredients stays null (not 0)', () => {
    const result = computeRecipeNutritionCoverage(
      [{ ingredientId: 'a', quantity: 100, unit: 'g' }],
      lookup({ a: { reference: verified({ calories: 100 }) } }),
    );
    expect(result.totals.calories).toBe(100);
    expect(result.totals.sodiumMg).toBeNull();
    expect(result.totals.fiberG).toBeNull();
  });

  it('empty recipe -> no coverage, estimated status, all-null totals', () => {
    const result = computeRecipeNutritionCoverage([], lookup({}));
    expect(result).toMatchObject({ totalCount: 0, resolvedCount: 0, isPartial: false, status: 'estimated' });
    expect(result.totals.calories).toBeNull();
  });
});
