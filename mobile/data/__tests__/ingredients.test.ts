import { INGREDIENTS, normalizeIngredientName, resolveCanonicalIngredient } from '../ingredients';

describe('normalizeIngredientName', () => {
  it('lowercases, trims, collapses whitespace', () => {
    expect(normalizeIngredientName('  Chicken   Breast ')).toBe('chicken breast');
    expect(normalizeIngredientName('')).toBe('');
  });
});

describe('resolveCanonicalIngredient (exact only - no fuzzy)', () => {
  it('resolves by exact catalog id', () => {
    expect(resolveCanonicalIngredient('ing-chicken-breast')?.id).toBe('ing-chicken-breast');
  });

  it('resolves by exact normalized display name (case-insensitive)', () => {
    expect(resolveCanonicalIngredient('chicken breast')?.id).toBe('ing-chicken-breast');
    expect(resolveCanonicalIngredient('Chicken Breast')?.id).toBe('ing-chicken-breast');
  });

  it('resolves by an authored alias', () => {
    expect(resolveCanonicalIngredient('boneless skinless chicken breast')?.id).toBe('ing-chicken-breast');
    expect(resolveCanonicalIngredient('  Large Egg ')?.id).toBe('ing-eggs');
    expect(resolveCanonicalIngredient('evoo')?.id).toBe('ing-olive-oil');
  });

  it('does NOT fuzzy-match near-misses', () => {
    expect(resolveCanonicalIngredient('chicken breasts fillet')).toBeNull();
    expect(resolveCanonicalIngredient('grilled chicken')).toBeNull();
    expect(resolveCanonicalIngredient('')).toBeNull();
    // @ts-expect-error deliberate wrong type
    expect(resolveCanonicalIngredient(123)).toBeNull();
  });
});

describe('catalog Phase 4 metadata invariants', () => {
  it('every ingredient has a normalizedName equal to its normalized display name', () => {
    for (const ing of INGREDIENTS) {
      expect(ing.normalizedName).toBe(normalizeIngredientName(ing.name));
    }
  });

  it('an ingredient with authored per-100g nutrition also carries a nutrition status', () => {
    for (const ing of INGREDIENTS) {
      if (ing.nutritionPer100g) {
        expect(ing.nutritionStatus).toBeDefined();
        expect(['estimated', 'candidate', 'verified']).toContain(ing.nutritionStatus);
      }
    }
  });

  it('gramsPerUnit / densityGPerMl values are positive when present', () => {
    for (const ing of INGREDIENTS) {
      if (ing.densityGPerMl !== undefined) expect(ing.densityGPerMl).toBeGreaterThan(0);
      for (const v of Object.values(ing.gramsPerUnit ?? {})) expect(v).toBeGreaterThan(0);
    }
  });
});
