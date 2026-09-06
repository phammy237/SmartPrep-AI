import { computeIngredientCoverage, shortfallLineFor } from '../pantryCoverage';

describe('computeIngredientCoverage - same-unit path (no metadata needed)', () => {
  it('fully covered when one lot meets the requirement', () => {
    const c = computeIngredientCoverage({ ingredientId: 'chk', requiredQuantity: 500, requiredUnit: 'g', lots: [{ quantity: 500, unit: 'g' }] });
    expect(c).toMatchObject({ status: 'covered', basis: 'same_unit', availableQuantity: 500 });
  });

  it('sums multiple lots of the same ingredient', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'chk',
      requiredQuantity: 500,
      requiredUnit: 'g',
      lots: [{ quantity: 150, unit: 'g' }, { quantity: 200, unit: 'g' }],
    });
    expect(c).toMatchObject({ status: 'partial', availableQuantity: 350, shortfallQuantity: 150, shortfallUnit: 'g' });
  });

  it('count units work with no metadata (4 cloves required, 2 available -> 2 short)', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'garlic',
      requiredQuantity: 4,
      requiredUnit: 'clove',
      lots: [{ quantity: 2, unit: 'clove' }],
    });
    expect(c).toMatchObject({ status: 'partial', availableQuantity: 2, shortfallQuantity: 2, shortfallUnit: 'clove' });
  });

  it('normalizes L vs l when matching lots', () => {
    const c = computeIngredientCoverage({ ingredientId: 'milk', requiredQuantity: 1, requiredUnit: 'L', lots: [{ quantity: 2, unit: 'l' }] });
    expect(c.status).toBe('covered');
  });
});

describe('computeIngredientCoverage - grams path', () => {
  it('g + kg -> deterministic (500 g required, 0.2 kg available -> 300 g short)', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'chk',
      requiredQuantity: 500,
      requiredUnit: 'g',
      lots: [{ quantity: 0.2, unit: 'kg' }],
    });
    expect(c).toMatchObject({ status: 'partial', basis: 'grams', requiredGrams: 500, availableGrams: 200, shortfallGrams: 300 });
  });

  it('oz + lb -> deterministic', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'beef',
      requiredQuantity: 2,
      requiredUnit: 'lb',
      lots: [{ quantity: 453.59237, unit: 'g' }],
    });
    expect(c.status).toBe('partial');
    expect(c.shortfallGrams).toBeCloseTo(453.592, 2);
  });

  it('count -> grams with per-unit metadata (2 items @ 174 g vs 500 g required)', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'chk',
      requiredQuantity: 500,
      requiredUnit: 'g',
      lots: [{ quantity: 2, unit: 'item' }],
      conversionMeta: { gramsPerUnit: { item: 174 } },
    });
    expect(c).toMatchObject({ status: 'partial', availableGrams: 348, shortfallGrams: 152 });
  });

  it('density-based conversion where supported (1 cup milk vs 100 g required)', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'milk',
      requiredQuantity: 100,
      requiredUnit: 'g',
      lots: [{ quantity: 1, unit: 'cup' }],
      conversionMeta: { densityGPerMl: 1.03 },
    });
    expect(c.status).toBe('covered');
    expect(c.availableGrams).toBeCloseTo(243.686, 2);
  });

  it('fully covered on the grams path', () => {
    const c = computeIngredientCoverage({
      ingredientId: 'chk',
      requiredQuantity: 100,
      requiredUnit: 'g',
      lots: [{ quantity: 0.2, unit: 'kg' }],
    });
    expect(c.status).toBe('covered');
  });
});

describe('computeIngredientCoverage - missing vs unresolved (they are different)', () => {
  it('missing: no matching lots at all', () => {
    const c = computeIngredientCoverage({ ingredientId: 'x', requiredQuantity: 1, requiredUnit: 'cup', lots: [] });
    expect(c).toMatchObject({ status: 'missing', basis: 'no_lots', reason: 'no_matching_pantry_stock' });
  });

  it('unresolved: matching stock exists but units cannot be compared - does NOT claim zero stock', () => {
    // 1 cup spinach required vs 120 g in pantry, no density -> cannot compare
    const c = computeIngredientCoverage({
      ingredientId: 'spinach',
      requiredQuantity: 1,
      requiredUnit: 'cup',
      lots: [{ quantity: 120, unit: 'g' }],
    });
    expect(c.status).toBe('unresolved');
    expect(c.status).not.toBe('missing');
    expect(c.matchedLotCount).toBe(1);
    expect(c).not.toHaveProperty('availableGrams');
  });

  it('unresolved: pantry lot in a count unit with no per-unit weight, requirement in grams', () => {
    const c = computeIngredientCoverage({ ingredientId: 'x', requiredQuantity: 200, requiredUnit: 'g', lots: [{ quantity: 1, unit: 'bag' }] });
    expect(c.status).toBe('unresolved');
  });

  it('pantry staple is always covered', () => {
    const c = computeIngredientCoverage({ ingredientId: 'salt', requiredQuantity: 1, requiredUnit: 'tsp', isPantryStaple: true, lots: [] });
    expect(c).toMatchObject({ status: 'covered', basis: 'staple' });
  });

  it('invalid required quantity -> unresolved, not missing', () => {
    const c = computeIngredientCoverage({ ingredientId: 'x', requiredQuantity: -5, requiredUnit: 'g', lots: [{ quantity: 100, unit: 'g' }] });
    expect(c).toMatchObject({ status: 'unresolved', reason: 'invalid_quantity' });
  });
});

describe('shortfallLineFor', () => {
  it('covered -> null (nothing to buy)', () => {
    expect(shortfallLineFor({ status: 'covered', ingredientId: 'x', requiredQuantity: 1, requiredUnit: 'g', matchedLotCount: 1, basis: 'same_unit' })).toBeNull();
  });

  it('missing -> full requirement line, recipe_requirement basis', () => {
    const line = shortfallLineFor({ status: 'missing', ingredientId: 'x', requiredQuantity: 3, requiredUnit: 'item', matchedLotCount: 0, basis: 'no_lots' });
    expect(line).toEqual({ quantity: 3, unit: 'item', quantityBasis: 'recipe_requirement', metadata: { coverage: 'missing' } });
  });

  it('unresolved -> conservative full requirement line, never a silent subtraction', () => {
    const line = shortfallLineFor({ status: 'unresolved', ingredientId: 'x', requiredQuantity: 1, requiredUnit: 'cup', matchedLotCount: 1, basis: 'unresolved', reason: 'missing_density' });
    expect(line).toMatchObject({ quantity: 1, unit: 'cup', quantityBasis: 'recipe_requirement', metadata: { coverage: 'unresolved', reason: 'missing_density' } });
  });

  it('partial same-unit -> the exact gap in the recipe unit, uncovered_shortfall basis', () => {
    const line = shortfallLineFor({
      status: 'partial',
      ingredientId: 'x',
      requiredQuantity: 500,
      requiredUnit: 'g',
      matchedLotCount: 2,
      basis: 'same_unit',
      shortfallQuantity: 150,
      shortfallUnit: 'g',
    });
    expect(line).toEqual({ quantity: 150, unit: 'g', quantityBasis: 'uncovered_shortfall', metadata: { coverage: 'partial' } });
  });

  it('partial grams -> converts the shortfall back to the recipe unit when deterministic', () => {
    const line = shortfallLineFor(
      { status: 'partial', ingredientId: 'x', requiredQuantity: 2, requiredUnit: 'lb', matchedLotCount: 1, basis: 'grams', shortfallGrams: 453.59237 },
    );
    expect(line).toMatchObject({ unit: 'lb', quantityBasis: 'uncovered_shortfall' });
    expect(line?.quantity).toBeCloseTo(1, 5);
  });

  it('partial grams -> falls back to grams when the recipe unit needs metadata we do not have here', () => {
    const line = shortfallLineFor(
      { status: 'partial', ingredientId: 'x', requiredQuantity: 3, requiredUnit: 'item', matchedLotCount: 1, basis: 'grams', shortfallGrams: 150 },
    );
    expect(line).toMatchObject({ quantity: 150, unit: 'g', quantityBasis: 'uncovered_shortfall', metadata: { originalUnit: 'item' } });
  });
});
