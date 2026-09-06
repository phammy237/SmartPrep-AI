import { normalizeUnit, sameCategory, unitCategory, unitToBaseFactor } from '../units';

describe('normalizeUnit', () => {
  it('folds the app-stored "L" onto canonical "l"', () => {
    expect(normalizeUnit('L')).toBe('l');
  });

  it('is case-insensitive and trims', () => {
    expect(normalizeUnit('  G ')).toBe('g');
    expect(normalizeUnit('Cup')).toBe('cup');
  });

  it('resolves common English aliases', () => {
    expect(normalizeUnit('grams')).toBe('g');
    expect(normalizeUnit('ounces')).toBe('oz');
    expect(normalizeUnit('tablespoon')).toBe('tbsp');
    expect(normalizeUnit('cloves')).toBe('clove');
  });

  it('returns null for unknown / empty units', () => {
    expect(normalizeUnit('handful')).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit('   ')).toBeNull();
  });
});

describe('unitCategory', () => {
  it('classifies mass / volume / count', () => {
    for (const u of ['mg', 'g', 'kg', 'oz', 'lb']) expect(unitCategory(u)).toBe('mass');
    for (const u of ['ml', 'l', 'tsp', 'tbsp', 'cup']) expect(unitCategory(u)).toBe('volume');
    for (const u of ['item', 'piece', 'serving', 'clove', 'slice', 'can', 'bag', 'bottle', 'package', 'container'])
      expect(unitCategory(u)).toBe('count');
  });

  it('null for unknown', () => {
    expect(unitCategory('smidge')).toBeNull();
  });
});

describe('unitToBaseFactor', () => {
  it('mass base is grams', () => {
    expect(unitToBaseFactor('g')).toBe(1);
    expect(unitToBaseFactor('kg')).toBe(1000);
    expect(unitToBaseFactor('mg')).toBe(0.001);
    expect(unitToBaseFactor('oz')).toBeCloseTo(28.349523125, 6);
    expect(unitToBaseFactor('lb')).toBeCloseTo(453.59237, 5);
  });

  it('volume base is millilitres', () => {
    expect(unitToBaseFactor('ml')).toBe(1);
    expect(unitToBaseFactor('l')).toBe(1000);
    expect(unitToBaseFactor('tsp')).toBeCloseTo(4.92892159375, 6);
    expect(unitToBaseFactor('tbsp')).toBeCloseTo(14.78676478125, 6);
    expect(unitToBaseFactor('cup')).toBeCloseTo(236.5882365, 5);
  });

  it('count units have no base factor', () => {
    expect(unitToBaseFactor('item')).toBeNull();
    expect(unitToBaseFactor('bag')).toBeNull();
  });
});

describe('sameCategory', () => {
  it('true within a category, false across', () => {
    expect(sameCategory('g', 'kg')).toBe(true);
    expect(sameCategory('ml', 'cup')).toBe(true);
    expect(sameCategory('g', 'ml')).toBe(false);
    expect(sameCategory('item', 'g')).toBe(false);
    expect(sameCategory('item', 'nonsense')).toBe(false);
  });
});
