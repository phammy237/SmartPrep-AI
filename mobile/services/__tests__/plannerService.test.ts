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

jest.mock('../recipeService', () => ({
  recipeService: { getRecipes: jest.fn(), countReadyToCookRecipes: jest.fn() },
}));

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
