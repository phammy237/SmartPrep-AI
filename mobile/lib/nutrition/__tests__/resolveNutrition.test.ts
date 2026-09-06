import { NutritionReference } from '../nutritionReference';
import { resolveIngredientNutrition } from '../resolveNutrition';

const verifiedRef: NutritionReference = {
  status: 'verified',
  source: 'usda',
  per100g: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  fdcId: 171077,
  verifiedAt: '2026-09-01T00:00:00.000Z',
};

const candidateRef: NutritionReference = {
  status: 'candidate',
  source: 'usda',
  per100g: { calories: 165, proteinG: 31 },
  fdcId: 999,
};

const estimateRef: NutritionReference = {
  status: 'estimated',
  source: 'catalog_estimate',
  per100g: { calories: 165, proteinG: 31 },
};

describe('resolveIngredientNutrition - happy path', () => {
  it('per-100g -> actual grams for a mass quantity, verified provenance propagates', () => {
    const r = resolveIngredientNutrition({ quantity: 200, unit: 'g', reference: verifiedRef });
    expect(r.status).toBe('verified');
    if (r.status === 'unresolved') throw new Error('unexpected');
    expect(r.grams).toBe(200);
    expect(r.snapshot.calories).toBe(330);
    expect(r.snapshot.proteinG).toBe(62);
    expect(r.snapshot.fiberG).toBeNull();
    expect(r.snapshot.status).toBe('verified');
    expect(r.snapshot.calculationBasis).toBe('per_quantity');
    expect(r.provenance).toEqual({
      source: 'usda',
      fdcId: 171077,
      verifiedAt: '2026-09-01T00:00:00.000Z',
      conversionMethod: 'direct_mass',
    });
  });

  it('converts a count quantity via per-unit weight', () => {
    const r = resolveIngredientNutrition({
      quantity: 2,
      unit: 'item',
      conversionMeta: { gramsPerUnit: { item: 174 } },
      reference: verifiedRef,
    });
    if (r.status === 'unresolved') throw new Error('unexpected');
    expect(r.grams).toBe(348);
    expect(r.provenance.conversionMethod).toBe('per_unit_weight');
  });
});

describe('resolveIngredientNutrition - verification is not fabricated', () => {
  it('a candidate reference yields real numbers but NON-verified status', () => {
    const r = resolveIngredientNutrition({ quantity: 100, unit: 'g', reference: candidateRef });
    expect(r.status).toBe('candidate');
    if (r.status === 'unresolved') throw new Error('unexpected');
    expect(r.snapshot.calories).toBe(165);
    // persisted-snapshot vocab has no "candidate" -> stored as estimated, with a note
    expect(r.snapshot.status).toBe('estimated');
    expect(r.snapshot.uncertaintyNotes).toMatch(/unconfirmed USDA/i);
  });

  it('an unresolved conversion never becomes verified/estimated - it stays unresolved with no snapshot', () => {
    const r = resolveIngredientNutrition({ quantity: 1, unit: 'cup', reference: verifiedRef });
    expect(r).toEqual({
      status: 'unresolved',
      reason: 'missing_density',
      grams: null,
      snapshot: null,
      provenance: { source: 'usda', fdcId: 171077, verifiedAt: '2026-09-01T00:00:00.000Z', conversionMethod: 'unresolved' },
    });
  });

  it('grams resolve but there is no nutrition reference -> unresolved (no fabricated snapshot)', () => {
    const noneRef: NutritionReference = { status: 'none', source: 'none', per100g: null };
    const r = resolveIngredientNutrition({ quantity: 100, unit: 'g', reference: noneRef });
    expect(r.status).toBe('unresolved');
    if (r.status !== 'unresolved') throw new Error('unexpected');
    expect(r.reason).toBe('no_nutrition_reference');
    expect(r.grams).toBe(100);
    expect(r.snapshot).toBeNull();
  });

  it('invalid quantity -> unresolved', () => {
    const r = resolveIngredientNutrition({ quantity: -1, unit: 'g', reference: verifiedRef });
    expect(r).toMatchObject({ status: 'unresolved', reason: 'invalid_quantity', snapshot: null });
  });
});

describe('resolveIngredientNutrition - estimate path', () => {
  it('estimated reference -> estimated resolution + snapshot status estimated', () => {
    const r = resolveIngredientNutrition({ quantity: 50, unit: 'g', reference: estimateRef });
    expect(r.status).toBe('estimated');
    if (r.status === 'unresolved') throw new Error('unexpected');
    expect(r.snapshot.status).toBe('estimated');
    expect(r.snapshot.calories).toBe(82.5);
    expect(r.provenance.source).toBe('catalog_estimate');
  });
});
