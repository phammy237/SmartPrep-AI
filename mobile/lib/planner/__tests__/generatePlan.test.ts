import { PantryItem, Recipe, RecipeIngredient } from '@/types';
import { GeneratePlanInput, generatePlan } from '../generatePlan';

const NOW = new Date('2026-06-10T12:00:00Z'); // today (UTC) = 2026-06-10
const TODAY = '2026-06-10';

function ing(over: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', imageUri: '', quantity: 300, unit: 'g', ...over };
}

function recipe(id: string, ingredients: RecipeIngredient[], servings = 2): Recipe {
  return {
    id,
    recipeVersionId: id,
    title: id,
    imageUri: '',
    prepTimeMinutes: 0,
    cookTimeMinutes: 0,
    difficulty: 'easy',
    servings,
    additionalCostEstimate: 0,
    smartMatchScore: 0,
    nutritionPerServing: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    reasons: [],
    ingredients,
    steps: [],
    cuisines: [],
    tags: [],
    collections: [],
  };
}

function pantryItem(over: Partial<PantryItem> = {}): PantryItem {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    ingredientId: 'ing-chicken-breast',
    name: 'Chicken Breast',
    imageUri: '',
    category: 'protein',
    quantity: 500,
    unit: 'g',
    freshness: { score: 50, confidence: 0.9, label: 'use_soon' },
    addedAt: 't',
    updatedAt: 't',
    source: 'manual',
    status: 'active',
    estimatedExpirationDate: '2026-06-11',
    expirationConfidence: 'high',
    ...over,
  };
}

function input(over: Partial<GeneratePlanInput>): GeneratePlanInput {
  return {
    dates: ['2026-06-10', '2026-06-11'],
    today: TODAY,
    timeZone: 'UTC',
    now: NOW,
    recipes: [],
    pantry: [],
    conversionMeta: new Map(),
    ...over,
  };
}

describe('generatePlan - freshness priority', () => {
  it('a tomorrow-expiring covered recipe is scheduled before a 4-day covered recipe', () => {
    const rChicken = recipe('rv-chicken', [ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 300 })]);
    const rSpinach = recipe('rv-spinach', [ing({ ingredientId: 'ing-spinach', name: 'Spinach', quantity: 100, unit: 'g' })]);
    const pantry = [
      pantryItem({ id: 'c', ingredientId: 'ing-chicken-breast', quantity: 500, estimatedExpirationDate: '2026-06-11' }), // critical
      pantryItem({ id: 's', ingredientId: 'ing-spinach', name: 'Spinach', quantity: 300, estimatedExpirationDate: '2026-06-14' }), // use_soon (+4)
    ];
    const out = generatePlan(input({ recipes: [rSpinach, rChicken], pantry, dates: ['2026-06-10', '2026-06-11'] }));
    expect(out.slots[0].recipeId).toBe('rv-chicken');
    expect(out.slots[0].minUrgentDaysUntilExpiry).toBe(1);
    expect(out.slots[0].freshnessPrioritized).toBe(true);
  });

  it('a fully-covered urgent recipe beats a heavily-missing urgent recipe', () => {
    const ready = recipe('rv-ready', [ing({ quantity: 300 })]);
    const missing = recipe('rv-missing', [
      ing({ quantity: 300 }),
      ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ing({ ingredientId: `ing-${k}`, name: k, quantity: 1, unit: 'item' })),
    ]);
    const pantry = [pantryItem({ id: 'c', quantity: 500 })];
    const out = generatePlan(input({ recipes: [missing, ready], pantry, dates: ['2026-06-10'] }));
    expect(out.slots[0].recipeId).toBe('rv-ready');
  });

  it('a fresh-only recipe still fills a slot but ranks below a meaningful urgent one', () => {
    const urgent = recipe('rv-urgent', [ing({ quantity: 300 })]);
    const fresh = recipe('rv-fresh', [ing({ ingredientId: 'ing-rice', name: 'Rice', quantity: 100, unit: 'g' })]);
    const pantry = [
      pantryItem({ id: 'c', quantity: 500, estimatedExpirationDate: '2026-06-11' }),
      pantryItem({ id: 'r', ingredientId: 'ing-rice', name: 'Rice', quantity: 2000, estimatedExpirationDate: '2026-12-01' }),
    ];
    const out = generatePlan(input({ recipes: [fresh, urgent], pantry, dates: ['2026-06-10', '2026-06-11'] }));
    expect(out.slots[0].recipeId).toBe('rv-urgent');
    expect(out.slots[1].recipeId).toBe('rv-fresh'); // still scheduled
    expect(out.slots[1].freshnessPrioritized).toBe(false);
  });

  it('an unknown-expiry pantry match gives no freshness boost', () => {
    const r = recipe('rv-x', [ing({ quantity: 300 })]);
    const pantry = [pantryItem({ id: 'c', quantity: 500, expirationConfidence: 'unknown', estimatedExpirationDate: undefined })];
    const out = generatePlan(input({ recipes: [r], pantry, dates: ['2026-06-10'] }));
    expect(out.slots[0].freshnessPrioritized).toBe(false);
    expect(out.slots[0].urgentIngredientIds).toEqual([]);
    expect(out.urgentIngredientsTargeted).toEqual([]);
  });
});

describe('generatePlan - virtual inventory (no double-counting)', () => {
  it('500 g chicken cannot fully cover two 400 g recipes in the same week', () => {
    const r1 = recipe('rv-1', [ing({ quantity: 400 })]);
    const r2 = recipe('rv-2', [ing({ quantity: 400 }), ing({ ingredientId: 'ing-rice', name: 'Rice', quantity: 200, unit: 'g' })]);
    const pantry = [pantryItem({ id: 'c', quantity: 500 })]; // urgent, no rice
    const out = generatePlan(input({ recipes: [r1, r2], pantry, dates: ['2026-06-10', '2026-06-11'] }));

    expect(out.slots.map((s) => s.recipeId)).toEqual(['rv-1', 'rv-2']);
    // day 2 recipe is picked despite its rice shortfall - because day 1 ate most of the chicken
    expect(out.slots[1].missingIngredientCount).toBe(1);
    expect(out.estimatedShortfallCount).toBe(1);
  });

  it('the first selection reduces availability for the next day (same recipe not blindly repeated)', () => {
    const r1 = recipe('rv-1', [ing({ quantity: 300 })]);
    const r2 = recipe('rv-2', [ing({ ingredientId: 'ing-tomato', name: 'Tomato', quantity: 2, unit: 'item' })]);
    const pantry = [
      pantryItem({ id: 'c', quantity: 300, estimatedExpirationDate: '2026-06-11' }), // exactly one recipe's worth, urgent
      pantryItem({ id: 't', ingredientId: 'ing-tomato', name: 'Tomato', quantity: 10, unit: 'item', estimatedExpirationDate: '2026-06-30' }),
    ];
    const out = generatePlan(input({ recipes: [r1, r2], pantry, dates: ['2026-06-10', '2026-06-11'] }));
    expect(out.slots[0].recipeId).toBe('rv-1'); // urgent, covered
    expect(out.slots[1].recipeId).toBe('rv-2'); // chicken gone -> the other recipe wins day 2
  });
});

describe('generatePlan - scheduling by expiry', () => {
  it('assigns the earliest-expiring recipe to the earliest feasible day', () => {
    const early = recipe('rv-early', [ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 300 })]);
    const late = recipe('rv-late', [ing({ ingredientId: 'ing-spinach', name: 'Spinach', quantity: 100, unit: 'g' })]);
    const pantry = [
      pantryItem({ id: 'c', ingredientId: 'ing-chicken-breast', quantity: 500, estimatedExpirationDate: '2026-06-11' }), // +1
      pantryItem({ id: 's', ingredientId: 'ing-spinach', name: 'Spinach', quantity: 300, estimatedExpirationDate: '2026-06-13' }), // +3
    ];
    const out = generatePlan(input({ recipes: [late, early], pantry, dates: ['2026-06-10', '2026-06-11'] }));
    expect(out.slots.map((s) => s.recipeId)).toEqual(['rv-early', 'rv-late']);
  });

  it('surfaces a warning when even the earliest slot is after the ingredient date', () => {
    const r = recipe('rv-x', [ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 300 })]);
    const pantry = [pantryItem({ id: 'c', quantity: 500, estimatedExpirationDate: '2026-06-09' })]; // already past today
    const out = generatePlan(input({ recipes: [r], pantry, dates: ['2026-06-10', '2026-06-11'] }));
    // one warning per at-risk ingredient (deduped), anchored to the earliest slot
    expect(out.warnings).toEqual([
      expect.objectContaining({
        code: 'expiry_after_planned_date',
        ingredientId: 'ing-chicken-breast',
        expirationDate: '2026-06-09',
        plannedDate: '2026-06-10',
      }),
    ]);
  });

  it('scales demand by planned servings before virtual allocation', () => {
    const big = recipe('rv-big', [ing({ quantity: 250 })], 2); // 250 g / 2 servings
    const other = recipe('rv-other', [ing({ quantity: 250 })], 2);
    const pantry = [pantryItem({ id: 'c', quantity: 500 })];

    // factor 1: 250 g each -> both fully covered across two days
    const f1 = generatePlan(input({ recipes: [big, other], pantry, dates: ['2026-06-10', '2026-06-11'] }));
    expect(f1.slots.every((s) => s.plannedServings === 2)).toBe(true);

    // factor 4 (8 planned servings): first recipe alone needs 1000 g -> drains the 500 g
    const f4 = generatePlan(
      input({
        recipes: [big, other],
        pantry,
        dates: ['2026-06-10', '2026-06-11'],
        plannedServings: () => 8,
      }),
    );
    expect(f4.slots[0].plannedServings).toBe(8);
    // day 2's recipe now finds no chicken left -> not freshness-prioritized
    expect(f4.slots[1].freshnessPrioritized).toBe(false);
  });
});

describe('generatePlan - determinism & diversity', () => {
  it('is fully deterministic for the same inputs', () => {
    const recipes = [
      recipe('rv-a', [ing({ quantity: 300 })]),
      recipe('rv-b', [ing({ ingredientId: 'ing-spinach', name: 'Spinach', quantity: 100, unit: 'g' })]),
      recipe('rv-c', [ing({ ingredientId: 'ing-rice', name: 'Rice', quantity: 100, unit: 'g' })]),
    ];
    const pantry = [
      pantryItem({ id: 'c', quantity: 500, estimatedExpirationDate: '2026-06-11' }),
      pantryItem({ id: 's', ingredientId: 'ing-spinach', name: 'Spinach', quantity: 300, estimatedExpirationDate: '2026-06-13' }),
    ];
    const a = generatePlan(input({ recipes, pantry, dates: ['2026-06-10', '2026-06-11', '2026-06-12'] }));
    const b = generatePlan(input({ recipes: [...recipes].reverse(), pantry, dates: ['2026-06-10', '2026-06-11', '2026-06-12'] }));
    expect(a.slots.map((s) => s.recipeId)).toEqual(b.slots.map((s) => s.recipeId));
  });

  it('spreads variety: with plenty of recipes, no recipe repeats until others are used', () => {
    const recipes = ['a', 'b', 'c'].map((k) => recipe(`rv-${k}`, [ing({ ingredientId: `ing-${k}`, name: k, quantity: 1, unit: 'item' })]));
    const pantry = ['a', 'b', 'c'].map((k) =>
      pantryItem({ id: k, ingredientId: `ing-${k}`, name: k, quantity: 10, unit: 'item', estimatedExpirationDate: '2026-06-12' }),
    );
    const out = generatePlan(input({ recipes, pantry, dates: ['2026-06-10', '2026-06-11', '2026-06-12'] }));
    expect(new Set(out.slots.map((s) => s.recipeId)).size).toBe(3);
  });

  it('repeats a recipe only when the catalog is smaller than the week', () => {
    const only = recipe('rv-only', [ing({ ingredientId: 'ing-rice', name: 'Rice', quantity: 100, unit: 'g' })]);
    const pantry = [pantryItem({ id: 'r', ingredientId: 'ing-rice', name: 'Rice', quantity: 5000, unit: 'g', estimatedExpirationDate: '2026-06-12' })];
    const out = generatePlan(input({ recipes: [only], pantry, dates: ['2026-06-10', '2026-06-11', '2026-06-12'] }));
    expect(out.slots.map((s) => s.recipeId)).toEqual(['rv-only', 'rv-only', 'rv-only']);
  });

  it('produces no slots when there are no dates', () => {
    const out = generatePlan(input({ recipes: [recipe('rv-a', [ing()])], pantry: [pantryItem()], dates: [] }));
    expect(out.slots).toEqual([]);
  });
});

describe('generatePlan - result summary', () => {
  it('reports distinct urgent ingredients targeted + shortfall count', () => {
    const r = recipe('rv-x', [
      ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 300 }),
      ing({ ingredientId: 'ing-parmesan', name: 'Parmesan', quantity: 1, unit: 'package' }), // not in pantry -> missing
    ]);
    const pantry = [pantryItem({ id: 'c', quantity: 500, estimatedExpirationDate: '2026-06-11' })];
    const out = generatePlan(input({ recipes: [r], pantry, dates: ['2026-06-10'] }));
    expect(out.urgentIngredientsTargeted).toEqual(['ing-chicken-breast']);
    expect(out.recipesUsingUrgentStock).toBe(1);
    expect(out.estimatedShortfallCount).toBe(1);
  });
});
