import { convertQuantity, resolveQuantityToGrams, roundGrams } from '../conversion';

describe('resolveQuantityToGrams - mass (deterministic)', () => {
  it('g / kg / mg', () => {
    expect(resolveQuantityToGrams(250, 'g')).toEqual({ status: 'converted', grams: 250, method: 'direct_mass' });
    expect(resolveQuantityToGrams(1.5, 'kg')).toEqual({ status: 'converted', grams: 1500, method: 'direct_mass' });
    expect(resolveQuantityToGrams(500, 'mg')).toEqual({ status: 'converted', grams: 0.5, method: 'direct_mass' });
  });

  it('oz / lb', () => {
    expect(resolveQuantityToGrams(8, 'oz')).toEqual({ status: 'converted', grams: 226.796, method: 'direct_mass' });
    expect(resolveQuantityToGrams(1, 'lb')).toEqual({ status: 'converted', grams: 453.592, method: 'direct_mass' });
  });

  it('folds the app-stored "L" and other aliases', () => {
    const r = resolveQuantityToGrams(1, 'kilograms');
    expect(r).toEqual({ status: 'converted', grams: 1000, method: 'direct_mass' });
  });
});

describe('resolveQuantityToGrams - volume needs ingredient density', () => {
  it('unresolved without density', () => {
    expect(resolveQuantityToGrams(1, 'cup')).toEqual({ status: 'unresolved', reason: 'missing_density' });
    expect(resolveQuantityToGrams(15, 'ml')).toEqual({ status: 'unresolved', reason: 'missing_density' });
  });

  it('converts with density (method ingredient_density)', () => {
    // 1 cup water-ish milk at 1.03 g/ml -> 236.588 ml * 1.03
    expect(resolveQuantityToGrams(1, 'cup', { densityGPerMl: 1.03 })).toEqual({
      status: 'converted',
      grams: roundGrams(236.5882365 * 1.03),
      method: 'ingredient_density',
    });
    // olive oil 1 tbsp at 0.913
    expect(resolveQuantityToGrams(1, 'tbsp', { densityGPerMl: 0.913 })).toEqual({
      status: 'converted',
      grams: roundGrams(14.78676478125 * 0.913),
      method: 'ingredient_density',
    });
  });
});

describe('resolveQuantityToGrams - count needs per-unit weight', () => {
  it('unresolved without per-unit weight', () => {
    expect(resolveQuantityToGrams(3, 'item')).toEqual({ status: 'unresolved', reason: 'missing_per_unit_weight' });
  });

  it('converts with gramsPerUnit (method per_unit_weight)', () => {
    expect(resolveQuantityToGrams(2, 'item', { gramsPerUnit: { item: 174 } })).toEqual({
      status: 'converted',
      grams: 348,
      method: 'per_unit_weight',
    });
    expect(resolveQuantityToGrams(3, 'clove', { gramsPerUnit: { clove: 3 } })).toEqual({
      status: 'converted',
      grams: 9,
      method: 'per_unit_weight',
    });
  });

  it('unresolved when gramsPerUnit lacks the specific unit', () => {
    expect(resolveQuantityToGrams(2, 'slice', { gramsPerUnit: { item: 28 } })).toEqual({
      status: 'unresolved',
      reason: 'missing_per_unit_weight',
    });
  });
});

describe('resolveQuantityToGrams - invalid input', () => {
  it('rejects zero / negative / non-finite / non-number', () => {
    expect(resolveQuantityToGrams(0, 'g')).toEqual({ status: 'unresolved', reason: 'invalid_quantity' });
    expect(resolveQuantityToGrams(-5, 'g')).toEqual({ status: 'unresolved', reason: 'invalid_quantity' });
    expect(resolveQuantityToGrams(Number.NaN, 'g')).toEqual({ status: 'unresolved', reason: 'invalid_quantity' });
    expect(resolveQuantityToGrams(Infinity, 'g')).toEqual({ status: 'unresolved', reason: 'invalid_quantity' });
    // @ts-expect-error deliberate wrong type
    expect(resolveQuantityToGrams('2', 'g')).toEqual({ status: 'unresolved', reason: 'invalid_quantity' });
  });

  it('rejects unknown units', () => {
    expect(resolveQuantityToGrams(2, 'handful')).toEqual({ status: 'unresolved', reason: 'unsupported_unit' });
  });

  it('never returns a fabricated 0 for an unresolved conversion', () => {
    const r = resolveQuantityToGrams(1, 'cup');
    expect(r.status).toBe('unresolved');
    expect(r).not.toHaveProperty('grams');
  });
});

describe('roundGrams - decimal-safe', () => {
  it('clears binary FP residue so equal inputs give equal outputs', () => {
    expect(roundGrams(0.1 + 0.2)).toBe(0.3);
    expect(roundGrams(226.79618500000002)).toBe(226.796);
  });
});

describe('convertQuantity - same category', () => {
  it('mass <-> mass', () => {
    expect(convertQuantity({ quantity: 1000, fromUnit: 'g', toUnit: 'kg' })).toEqual({
      status: 'converted',
      value: 1,
      unit: 'kg',
      method: 'direct_mass',
    });
    expect(convertQuantity({ quantity: 1, fromUnit: 'lb', toUnit: 'oz' })).toEqual({
      status: 'converted',
      value: 16,
      unit: 'oz',
      method: 'direct_mass',
    });
  });

  it('volume <-> volume (tsp / tbsp / cup)', () => {
    expect(convertQuantity({ quantity: 3, fromUnit: 'tsp', toUnit: 'tbsp' })).toEqual({
      status: 'converted',
      value: 1,
      unit: 'tbsp',
      method: 'direct_volume',
    });
    expect(convertQuantity({ quantity: 16, fromUnit: 'tbsp', toUnit: 'cup' })).toEqual({
      status: 'converted',
      value: 1,
      unit: 'cup',
      method: 'direct_volume',
    });
    expect(convertQuantity({ quantity: 1, fromUnit: 'cup', toUnit: 'ml' })).toEqual({
      status: 'converted',
      value: 236.588,
      unit: 'ml',
      method: 'direct_volume',
    });
  });
});

describe('convertQuantity - cross category', () => {
  it('volume -> mass with density', () => {
    expect(convertQuantity({ quantity: 1, fromUnit: 'cup', toUnit: 'g', meta: { densityGPerMl: 1.03 } })).toEqual({
      status: 'converted',
      value: roundGrams(236.5882365 * 1.03),
      unit: 'g',
      method: 'ingredient_density',
    });
  });

  it('count -> mass with per-unit weight', () => {
    expect(convertQuantity({ quantity: 2, fromUnit: 'item', toUnit: 'g', meta: { gramsPerUnit: { item: 50 } } })).toEqual({
      status: 'converted',
      value: 100,
      unit: 'g',
      method: 'per_unit_weight',
    });
  });

  it('mass -> count with per-unit weight (reverse)', () => {
    expect(convertQuantity({ quantity: 348, fromUnit: 'g', toUnit: 'item', meta: { gramsPerUnit: { item: 174 } } })).toEqual({
      status: 'converted',
      value: 2,
      unit: 'item',
      method: 'per_unit_weight',
    });
  });

  it('unresolved cross-category conversions', () => {
    expect(convertQuantity({ quantity: 1, fromUnit: 'cup', toUnit: 'g' })).toEqual({
      status: 'unresolved',
      reason: 'missing_density',
    });
    expect(convertQuantity({ quantity: 3, fromUnit: 'item', toUnit: 'g' })).toEqual({
      status: 'unresolved',
      reason: 'missing_per_unit_weight',
    });
    // count <-> count with different labels is never assumed equivalent
    expect(convertQuantity({ quantity: 2, fromUnit: 'item', toUnit: 'piece' })).toEqual({
      status: 'unresolved',
      reason: 'incompatible_units',
    });
    // count <-> volume is unsupported
    expect(convertQuantity({ quantity: 1, fromUnit: 'item', toUnit: 'cup', meta: { gramsPerUnit: { item: 50 }, densityGPerMl: 1 } })).toEqual({
      status: 'unresolved',
      reason: 'incompatible_units',
    });
  });

  it('rejects invalid quantity / unknown unit', () => {
    expect(convertQuantity({ quantity: -1, fromUnit: 'g', toUnit: 'kg' })).toEqual({ status: 'unresolved', reason: 'invalid_quantity' });
    expect(convertQuantity({ quantity: 1, fromUnit: 'g', toUnit: 'blorp' })).toEqual({ status: 'unresolved', reason: 'unsupported_unit' });
  });
});
