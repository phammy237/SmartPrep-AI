import { PlanDemandContribution, computePlanGroceryDemand } from '../planDemand';
import { PantryLot } from '../pantryCoverage';
import { IngredientConversionMeta } from '../conversion';

function contribution(over: Partial<PlanDemandContribution> = {}): PlanDemandContribution {
  return { recipeVersionId: 'rv-1', quantity: 100, unit: 'g', isPantryStaple: false, ...over };
}

function demand(args: {
  contributions: PlanDemandContribution[];
  lots?: PantryLot[];
  conversionMeta?: IngredientConversionMeta;
  ingredientId?: string;
}) {
  const result = computePlanGroceryDemand({
    ingredients: [
      {
        ingredientId: args.ingredientId ?? 'ing-chicken-breast',
        name: 'Chicken Breast',
        imageUri: 'x',
        contributions: args.contributions,
        lots: args.lots ?? [],
        conversionMeta: args.conversionMeta,
      },
    ],
  });
  return result.ingredients[0];
}

describe('computePlanGroceryDemand - single recipe', () => {
  it('one recipe, one ingredient, no pantry -> missing for the full requirement', () => {
    const d = demand({ contributions: [contribution({ quantity: 300, unit: 'g' })] });
    expect(d.status).toBe('missing');
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement).toEqual({ quantity: 300, unit: 'g' });
    expect(d.segments[0].coverage.status).toBe('missing');
  });

  it('one recipe, pantry has plenty -> covered, no shoppable segment need', () => {
    const d = demand({
      contributions: [contribution({ quantity: 300, unit: 'g' })],
      lots: [{ quantity: 500, unit: 'g' }],
    });
    expect(d.status).toBe('covered');
    expect(d.segments[0].coverage.status).toBe('covered');
  });
});

describe('computePlanGroceryDemand - multiple recipes, one ingredient', () => {
  it('sums demand across recipes into ONE requirement', () => {
    const d = demand({
      contributions: [
        contribution({ recipeVersionId: 'rv-A', quantity: 300, unit: 'g' }),
        contribution({ recipeVersionId: 'rv-B', quantity: 400, unit: 'g' }),
      ],
    });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement).toEqual({ quantity: 700, unit: 'g' });
    expect(d.segments[0].contributingRecipeVersionIds).toEqual(expect.arrayContaining(['rv-A', 'rv-B']));
    expect(d.recipeVersionIds).toEqual(expect.arrayContaining(['rv-A', 'rv-B']));
  });

  it('CRITICAL: pantry stock is allocated ONCE against total demand, not per recipe', () => {
    // A needs 300 g, B needs 400 g, pantry has 250 g -> correct shortfall is 450 g
    // (NOT A:50 + B:150 = 200, which spends the same 250 g twice).
    const d = demand({
      contributions: [
        contribution({ recipeVersionId: 'rv-A', quantity: 300, unit: 'g' }),
        contribution({ recipeVersionId: 'rv-B', quantity: 400, unit: 'g' }),
      ],
      lots: [{ quantity: 250, unit: 'g' }],
    });
    expect(d.status).toBe('partial');
    expect(d.segments[0].coverage).toMatchObject({
      status: 'partial',
      availableQuantity: 250,
      shortfallQuantity: 450,
      shortfallUnit: 'g',
    });
  });

  it('aggregates multiple pantry lots exactly once', () => {
    const d = demand({
      contributions: [
        contribution({ recipeVersionId: 'rv-A', quantity: 300, unit: 'g' }),
        contribution({ recipeVersionId: 'rv-B', quantity: 400, unit: 'g' }),
      ],
      lots: [{ quantity: 100, unit: 'g' }, { quantity: 150, unit: 'g' }],
    });
    expect(d.segments[0].coverage).toMatchObject({ availableQuantity: 250, shortfallQuantity: 450 });
  });

  it('fully covered by combined pantry', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 300, unit: 'g', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 200, unit: 'g', recipeVersionId: 'rv-B' }),
      ],
      lots: [{ quantity: 600, unit: 'g' }],
    });
    expect(d.status).toBe('covered');
  });

  it('completely missing when there is no matching stock', () => {
    const d = demand({
      contributions: [contribution({ quantity: 2, unit: 'item' }), contribution({ quantity: 3, unit: 'item' })],
    });
    expect(d.status).toBe('missing');
    expect(d.segments[0].requirement).toEqual({ quantity: 5, unit: 'item' });
  });
});

describe('computePlanGroceryDemand - unit handling (central conversion engine only)', () => {
  it('compatible mass units combine without metadata: 300 g + 0.5 kg -> 800 g', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 300, unit: 'g', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 0.5, unit: 'kg', recipeVersionId: 'rv-B' }),
      ],
    });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement).toEqual({ quantity: 800, unit: 'g' });
  });

  it('compatible avoirdupois masses combine: 2 lb + 8 oz', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 2, unit: 'lb', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 8, unit: 'oz', recipeVersionId: 'rv-B' }),
      ],
    });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement.unit).toBe('lb');
    expect(d.segments[0].requirement.quantity).toBeCloseTo(2.5, 5);
  });

  it('compatible volume units combine without metadata: 200 ml + 0.3 L -> 500 ml', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 200, unit: 'ml', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 0.3, unit: 'L', recipeVersionId: 'rv-B' }),
      ],
    });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement).toEqual({ quantity: 500, unit: 'ml' });
  });

  it('cross-category with density metadata combines via grams: 1 cup + 200 g (density 1.0)', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 1, unit: 'cup', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 200, unit: 'g', recipeVersionId: 'rv-B' }),
      ],
      conversionMeta: { densityGPerMl: 1 },
    });
    // 1 cup = 236.588 ml * 1.0 g/ml = 236.588 g  (+200)
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement.unit).toBe('g');
    expect(d.segments[0].requirement.quantity).toBeCloseTo(436.588, 2);
  });

  it('cross-category with per-unit weight combines via grams: 2 item + 100 g (item=50 g)', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 2, unit: 'item', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 100, unit: 'g', recipeVersionId: 'rv-B' }),
      ],
      conversionMeta: { gramsPerUnit: { item: 50 } },
    });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement).toEqual({ quantity: 200, unit: 'g' });
  });

  it('incompatible units stay SEPARATE and are never invented: 2 cups + 300 g, no metadata', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 2, unit: 'cup', recipeVersionId: 'rv-A' }),
        contribution({ quantity: 300, unit: 'g', recipeVersionId: 'rv-B' }),
      ],
    });
    // the g demand gets a real coverage segment; the cup demand is a separate,
    // conservative, flagged segment (no pantry comparison, never "missing").
    expect(d.segments).toHaveLength(2);
    const gramSeg = d.segments.find((s) => s.requirement.unit === 'g');
    const cupSeg = d.segments.find((s) => s.requirement.unit === 'cup');
    expect(gramSeg?.requirement.quantity).toBe(300);
    expect(gramSeg?.incombinable).toBe(false);
    expect(cupSeg).toMatchObject({ status: 'unresolved', incombinable: true });
    expect(cupSeg?.requirement).toEqual({ quantity: 2, unit: 'cup' });
  });

  it('a wholly-unknown unit is kept as a conservative unresolved segment', () => {
    const d = demand({ contributions: [contribution({ quantity: 1, unit: 'pinch' })] });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0]).toMatchObject({ status: 'unresolved', incombinable: true });
    expect(d.segments[0].requirement).toEqual({ quantity: 1, unit: 'pinch' });
  });
});

describe('computePlanGroceryDemand - staples and empty demand', () => {
  it('staple-only ingredient produces no segments (status covered)', () => {
    const d = demand({ contributions: [contribution({ isPantryStaple: true }), contribution({ isPantryStaple: true })] });
    expect(d.segments).toEqual([]);
    expect(d.status).toBe('covered');
  });

  it('mixed staple + non-staple: only the non-staple demand is shopped', () => {
    const d = demand({
      contributions: [
        contribution({ quantity: 200, unit: 'g', isPantryStaple: true, recipeVersionId: 'rv-A' }),
        contribution({ quantity: 300, unit: 'g', isPantryStaple: false, recipeVersionId: 'rv-B' }),
      ],
    });
    expect(d.segments).toHaveLength(1);
    expect(d.segments[0].requirement).toEqual({ quantity: 300, unit: 'g' });
  });
});

describe('computePlanGroceryDemand - unresolved conversion against pantry', () => {
  it('recipe ml vs pantry g with no density -> unresolved, not missing (pantry not claimed zero)', () => {
    const d = demand({
      ingredientId: 'ing-heavy-cream',
      contributions: [contribution({ quantity: 250, unit: 'ml', recipeVersionId: 'rv-A' })],
      lots: [{ quantity: 500, unit: 'g' }],
    });
    expect(d.status).toBe('unresolved');
    expect(d.segments[0].coverage.status).toBe('unresolved');
    expect(d.segments[0].requirement).toEqual({ quantity: 250, unit: 'ml' });
  });
});
