import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { MealPlanEntry, PantryItem, Recipe, RecipeIngredient } from '@/types';
import { nutritionService } from '../nutritionService';
import { plannerService } from '../plannerService';

jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getUser: jest.fn() } } }));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchMealPlanEntries: jest.fn(),
  fetchRecipeVersions: jest.fn(),
  fetchPantryItems: jest.fn(),
  createMealPlanEntry: jest.fn(),
  deleteMealPlanEntry: jest.fn(),
  deletePlannedEntriesInRange: jest.fn(),
  updateMealPlanEntry: jest.fn(),
}));

jest.mock('../nutritionService', () => ({
  nutritionService: { getConversionMetaMap: jest.fn() },
}));

// plannerService now imports the pure `hydrateRecipe` from recipeService; keep
// the real (pure) implementation, only its Supabase-touching parts are covered
// by the repository / client mocks above.
jest.mock('../recipeService', () => jest.requireActual('../recipeService'));

const repo = repositories as jest.Mocked<typeof repositories>;
const getUser = supabase.auth.getUser as jest.Mock;
const getConversionMetaMap = nutritionService.getConversionMetaMap as jest.Mock;

function ing(over: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', imageUri: 'x', quantity: 300, unit: 'g', ...over };
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

function entry(over: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    scheduledDate: '2026-09-07',
    timezone: 'UTC',
    mealSlot: 'dinner',
    recipeVersionId: 'rv-A',
    plannedServings: 2,
    status: 'planned',
    createdAt: 't',
    updatedAt: 't',
    ...over,
  };
}

function pantryItem(over: Partial<PantryItem> = {}): PantryItem {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    ingredientId: 'ing-chicken-breast',
    name: 'Chicken Breast',
    imageUri: '',
    category: 'protein',
    quantity: 250,
    unit: 'g',
    freshness: { score: 80, confidence: 0.8, label: 'fresh' },
    addedAt: 't',
    updatedAt: 't',
    source: 'manual',
    normalizedName: 'chicken breast',
    status: 'active',
    quantityConfidence: 'exact',
    expirationConfidence: 'unknown',
    ...over,
  } as PantryItem;
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  getConversionMetaMap.mockResolvedValue(new Map());
  repo.fetchPantryItems.mockResolvedValue([]);
  repo.fetchRecipeVersions.mockResolvedValue([]);
  repo.fetchMealPlanEntries.mockResolvedValue([]);
});

describe('plannerService.getPlanGroceryDemand', () => {
  it('requires a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC')).rejects.toThrow('Not signed in');
    expect(repo.fetchMealPlanEntries).not.toHaveBeenCalled();
  });

  it('one planned recipe -> demand for its ingredients, with a stable plan key', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([entry({ recipeVersionId: 'rv-A', plannedServings: 2 })]);
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ quantity: 300, unit: 'g' })], 2)]);

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');

    expect(result.planGenerationKey).toBe('mealplan_2026-09-07_2026-09-13');
    expect(result.plannedRecipeCount).toBe(1);
    const chicken = result.demand.ingredients.find((i) => i.ingredientId === 'ing-chicken-breast');
    expect(chicken?.segments[0].requirement).toEqual({ quantity: 300, unit: 'g' });
  });

  it('aggregates the SAME ingredient across multiple planned recipes into one requirement', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([
      entry({ recipeVersionId: 'rv-A', plannedServings: 2 }),
      entry({ recipeVersionId: 'rv-B', plannedServings: 2 }),
    ]);
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe('rv-A', [ing({ quantity: 300, unit: 'g' })], 2),
      recipe('rv-B', [ing({ quantity: 400, unit: 'g' })], 2),
    ]);

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');
    const chicken = result.demand.ingredients[0];
    expect(chicken.segments[0].requirement).toEqual({ quantity: 700, unit: 'g' });
    expect(chicken.recipeVersionIds).toEqual(expect.arrayContaining(['rv-A', 'rv-B']));
  });

  it('scales each recipe by plannedServings / recipe.servings', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([entry({ recipeVersionId: 'rv-A', plannedServings: 8 })]);
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ quantity: 300, unit: 'g' })], 4)]); // factor 2

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');
    expect(result.demand.ingredients[0].segments[0].requirement).toEqual({ quantity: 600, unit: 'g' });
  });

  it('compares aggregated demand to the pantry exactly once (250 g on hand -> 450 g short)', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([
      entry({ recipeVersionId: 'rv-A', plannedServings: 2 }),
      entry({ recipeVersionId: 'rv-B', plannedServings: 2 }),
    ]);
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe('rv-A', [ing({ quantity: 300, unit: 'g' })], 2),
      recipe('rv-B', [ing({ quantity: 400, unit: 'g' })], 2),
    ]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem({ quantity: 250, unit: 'g' })]);

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');
    expect(result.demand.ingredients[0].segments[0].coverage).toMatchObject({
      status: 'partial',
      availableQuantity: 250,
      shortfallQuantity: 450,
    });
  });

  it('ignores entries that are not status = planned', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([
      entry({ recipeVersionId: 'rv-A', status: 'planned' }),
      entry({ recipeVersionId: 'rv-A', status: 'completed' }),
      entry({ recipeVersionId: 'rv-A', status: 'skipped' }),
    ]);
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ quantity: 100, unit: 'g' })], 2)]);

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');
    expect(result.plannedRecipeCount).toBe(1);
    expect(result.demand.ingredients[0].segments[0].requirement).toEqual({ quantity: 100, unit: 'g' });
  });

  it('counts (does not silently drop) planned entries whose recipe is missing', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([entry({ recipeVersionId: 'rv-GONE' }), entry({ recipeVersionId: 'rv-A' })]);
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ quantity: 100, unit: 'g' })], 2)]);

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');
    expect(result.unresolvedRecipeCount).toBe(1);
    expect(result.plannedRecipeCount).toBe(1);
  });

  it('drops pantry-staple ingredients from demand', async () => {
    repo.fetchMealPlanEntries.mockResolvedValue([entry({ recipeVersionId: 'rv-A' })]);
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe(
        'rv-A',
        [ing({ ingredientId: 'ing-salt', name: 'Salt', quantity: 5, unit: 'g', isPantryStaple: true })],
        2,
      ),
    ]);

    const result = await plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC');
    const salt = result.demand.ingredients.find((i) => i.ingredientId === 'ing-salt');
    expect(salt?.segments).toEqual([]);
  });

  it('propagates a Supabase error from the meal-plan fetch', async () => {
    repo.fetchMealPlanEntries.mockRejectedValue(new Error('rls'));
    await expect(plannerService.getPlanGroceryDemand('2026-09-07', '2026-09-13', 'UTC')).rejects.toThrow('rls');
  });
});

describe('plannerService.generateWeek', () => {
  const WEEK_START = '2026-09-07'; // Monday
  const WEEK_END = '2026-09-09'; // 3-day window for brevity

  beforeEach(() => {
    repo.createMealPlanEntry.mockImplementation(async (_userId, input) =>
      entry({
        scheduledDate: input.scheduledDate,
        recipeVersionId: input.recipeVersionId,
        plannedServings: input.plannedServings,
      }),
    );
    repo.deletePlannedEntriesInRange.mockResolvedValue(undefined);
  });

  it('requires a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC')).rejects.toThrow('Not signed in');
    expect(repo.deletePlannedEntriesInRange).not.toHaveBeenCalled();
  });

  it('empty recipe catalog is a no-op: returns existing entries, writes nothing', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([]);
    repo.fetchMealPlanEntries.mockResolvedValue([entry()]);

    const result = await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');

    expect(result.entries).toHaveLength(1);
    expect(result.summary).toEqual({
      urgentIngredientCount: 0,
      recipesUsingUrgentStock: 0,
      estimatedShortfallCount: 0,
      expiryWarnings: [],
    });
    expect(repo.deletePlannedEntriesInRange).not.toHaveBeenCalled();
    expect(repo.createMealPlanEntry).not.toHaveBeenCalled();
  });

  it('clears only still-planned dinners in range, then creates one dinner per day', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ quantity: 200 })])]);
    repo.fetchPantryItems.mockResolvedValue([]);

    const result = await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');

    expect(repo.deletePlannedEntriesInRange).toHaveBeenCalledWith('user-1', 'dinner', WEEK_START, WEEK_END);
    expect(repo.createMealPlanEntry).toHaveBeenCalledTimes(3);
    expect(result.entries).toHaveLength(3);
    for (const call of repo.createMealPlanEntry.mock.calls) {
      expect(call[1]).toMatchObject({ mealSlot: 'dinner', timezone: 'UTC', plannedServings: 2 });
    }
    expect(repo.createMealPlanEntry.mock.calls.map((c) => c[1].scheduledDate)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  it('loads conversion metadata exactly once and never mutates the pantry snapshot', async () => {
    const pantry = [pantryItem({ id: 'c', quantity: 500, estimatedExpirationDate: '2026-09-08', expirationConfidence: 'high' })];
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ quantity: 300 })])]);
    repo.fetchPantryItems.mockResolvedValue(pantry);

    await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');

    expect(getConversionMetaMap).toHaveBeenCalledTimes(1);
    expect(pantry[0].quantity).toBe(500); // planning never touches real pantry
  });

  it('prioritizes a recipe that uses an expiring pantry ingredient (summary reflects it)', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe('rv-fresh', [ing({ ingredientId: 'ing-rice', name: 'Rice', quantity: 100, unit: 'g' })]),
      recipe('rv-urgent', [ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 200 })]),
    ]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ id: 'c', ingredientId: 'ing-chicken-breast', quantity: 500, estimatedExpirationDate: '2026-09-08', expirationConfidence: 'high' }),
      pantryItem({ id: 'r', ingredientId: 'ing-rice', name: 'Rice', quantity: 2000, unit: 'g', estimatedExpirationDate: '2027-01-01', expirationConfidence: 'high' }),
    ]);

    const result = await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');

    // the urgent recipe lands on the first day
    expect(result.entries[0].recipeVersionId).toBe('rv-urgent');
    expect(result.summary.urgentIngredientCount).toBe(1);
    expect(result.summary.recipesUsingUrgentStock).toBeGreaterThanOrEqual(1);
  });

  it('surfaces an expiry-conflict warning when the ingredient date is already past', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-A', [ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 200 })])]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ id: 'c', quantity: 500, estimatedExpirationDate: '2020-01-01', expirationConfidence: 'high' }),
    ]);

    const result = await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');
    expect(result.summary.expiryWarnings).toEqual([
      { ingredientName: 'Chicken', expirationDate: '2020-01-01', plannedDate: '2026-09-07' },
    ]);
  });

  it('is deterministic for the same inputs', async () => {
    const recipes = [
      recipe('rv-a', [ing({ ingredientId: 'ing-chicken-breast', name: 'Chicken', quantity: 200 })]),
      recipe('rv-b', [ing({ ingredientId: 'ing-spinach', name: 'Spinach', quantity: 100, unit: 'g' })]),
    ];
    repo.fetchRecipeVersions.mockResolvedValue(recipes);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ id: 'c', ingredientId: 'ing-chicken-breast', quantity: 500, estimatedExpirationDate: '2026-09-08', expirationConfidence: 'high' }),
      pantryItem({ id: 's', ingredientId: 'ing-spinach', name: 'Spinach', quantity: 300, estimatedExpirationDate: '2026-09-11', expirationConfidence: 'high' }),
    ]);

    const a = await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');
    const b = await plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC');
    expect(a.entries.map((e) => e.recipeVersionId)).toEqual(b.entries.map((e) => e.recipeVersionId));
  });

  it('propagates a Supabase failure from the recipe fetch', async () => {
    repo.fetchRecipeVersions.mockRejectedValue(new Error('catalog rls'));
    await expect(plannerService.generateWeek(WEEK_START, WEEK_END, 'UTC')).rejects.toThrow('catalog rls');
  });
});
