import { basisHasAnyNutrient, scaleBasisToGrams, toNutrientBasis } from '../nutritionReference';

describe('toNutrientBasis', () => {
  it('keeps only known non-negative finite nutrients', () => {
    expect(
      toNutrientBasis({ calories: 165, proteinG: 31, carbsG: 0, fatG: -1, fiberG: 'x', sugarG: null, extra: 9 }),
    ).toEqual({ calories: 165, proteinG: 31, carbsG: 0 });
  });

  it('returns {} for junk', () => {
    expect(toNutrientBasis(null)).toEqual({});
    expect(toNutrientBasis('nope')).toEqual({});
  });
});

describe('basisHasAnyNutrient', () => {
  it('true iff at least one nutrient is a number', () => {
    expect(basisHasAnyNutrient({ calories: 10 })).toBe(true);
    expect(basisHasAnyNutrient({ fiberG: 0 })).toBe(true);
    expect(basisHasAnyNutrient({})).toBe(false);
    expect(basisHasAnyNutrient(null)).toBe(false);
  });
});

describe('scaleBasisToGrams', () => {
  it('scales per-100g to actual grams', () => {
    const basis = { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 };
    expect(scaleBasisToGrams(basis, 200)).toEqual({
      calories: 330,
      proteinG: 62,
      carbsG: 0,
      fatG: 7.2,
      fiberG: null,
      sugarG: null,
      sodiumMg: null,
    });
  });

  it('unknown nutrients stay null, never 0', () => {
    const r = scaleBasisToGrams({ calories: 100 }, 50);
    expect(r.calories).toBe(50);
    expect(r.proteinG).toBeNull();
    expect(r.fiberG).toBeNull();
  });

  it('rejects non-positive / non-finite grams', () => {
    expect(() => scaleBasisToGrams({ calories: 100 }, 0)).toThrow();
    expect(() => scaleBasisToGrams({ calories: 100 }, -5)).toThrow();
    expect(() => scaleBasisToGrams({ calories: 100 }, Number.NaN)).toThrow();
  });

  it('rounds decimal-safe (1 dp)', () => {
    expect(scaleBasisToGrams({ calories: 33.3 }, 33).calories).toBe(11);
  });
});
