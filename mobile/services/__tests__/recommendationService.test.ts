import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { MealPlanEntry, PantryItem, Recipe, RecipeIngredient } from '@/types';
import { nutritionService } from '../nutritionService';
import { recommendationService } from '../recommendationService';

jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getUser: jest.fn() } } }));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchRecipeVersions: jest.fn(),
  fetchPantryItems: jest.fn(),
  fetchMealPlanEntries: jest.fn(),
  // recipeService (loaded for its pure hydrateRecipe) imports these too:
  fetchRecipeVersionById: jest.fn(),
  fetchSavedRecipes: jest.fn(),
  saveRecipe: jest.fn(),
  unsaveRecipe: jest.fn(),
}));

jest.mock('../nutritionService', () => ({
  nutritionService: { getConversionMetaMap: jest.fn() },
}));

const repo = repositories as jest.Mocked<typeof repositories>;
const getUser = supabase.auth.getUser as jest.Mock;
const getConversionMetaMap = nutritionService.getConversionMetaMap as jest.Mock;

const NOW = new Date('2026-06-10T12:00:00Z'); // today (UTC) = 2026-06-10; window end = 2026-06-17

function ing(over: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', imageUri: '', quantity: 300, unit: 'g', ...over };
}

function recipe(id: string, ingredients: RecipeIngredient[], over: Partial<Recipe> = {}): Recipe {
  return {
    id,
    recipeVersionId: id,
    title: id === 'rv-stirfry' ? 'Chicken Stir Fry' : id,
    imageUri: '',
    prepTimeMinutes: 5,
    cookTimeMinutes: 10,
    difficulty: 'easy',
    servings: 2,
    additionalCostEstimate: 0,
    smartMatchScore: 0,
    nutritionPerServing: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    reasons: [],
    ingredients,
    steps: [],
    cuisines: [],
    tags: [],
    collections: [],
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
    quantity: 500,
    unit: 'g',
    freshness: { score: 50, confidence: 0.9, label: 'use_soon' },
    addedAt: 't',
    updatedAt: 't',
    source: 'manual',
    status: 'active',
    estimatedExpirationDate: '2026-06-11', // tomorrow -> critical
    expirationConfidence: 'high',
    ...over,
  };
}

function planEntry(over: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    scheduledDate: '2026-06-12',
    timezone: 'UTC',
    mealSlot: 'dinner',
    recipeVersionId: 'rv-stirfry',
    plannedServings: 2,
    status: 'planned',
    createdAt: 't',
    updatedAt: 't',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  getConversionMetaMap.mockResolvedValue(new Map());
  repo.fetchRecipeVersions.mockResolvedValue([]);
  repo.fetchPantryItems.mockResolvedValue([]);
  repo.fetchMealPlanEntries.mockResolvedValue([]);
});

const run = () => recommendationService.getUseSoonRecommendations({ timeZone: 'UTC', now: NOW });

describe('getUseSoonRecommendations - guards & empty cases', () => {
  it('requires an authenticated user and never queries when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(run()).rejects.toThrow('Not signed in');
    expect(repo.fetchRecipeVersions).not.toHaveBeenCalled();
    expect(repo.fetchPantryItems).not.toHaveBeenCalled();
  });

  it('empty pantry -> no recommendations', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockResolvedValue([]);
    await expect(run()).resolves.toEqual([]);
  });

  it('pantry with nothing urgent -> no recommendations', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ estimatedExpirationDate: '2026-07-20', expirationConfidence: 'high' }), // fresh
    ]);
    await expect(run()).resolves.toEqual([]);
  });

  it('urgent stock the recipes do not use -> no recommendations', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe('rv-rice', [ing({ ingredientId: 'ing-rice', name: 'Rice' })]),
    ]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]); // urgent chicken, unused by the rice recipe
    await expect(run()).resolves.toEqual([]);
  });
});

describe('getUseSoonRecommendations - happy path', () => {
  it('recommends a recipe that uses tomorrow-expiring stock, with fact-derived reasons', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing({ quantity: 300, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem({ quantity: 500, unit: 'g' })]);

    const [rec, ...rest] = await run();
    expect(rest).toEqual([]);
    expect(rec).toMatchObject({
      recipeId: 'rv-stirfry',
      title: 'Chicken Stir Fry',
      tier: 'ready_now',
      missingIngredientCount: 0,
      coveredCount: 1,
      totalCount: 1,
    });
    expect(rec.urgentIngredients).toHaveLength(1);
    expect(rec.urgentIngredients[0]).toMatchObject({
      ingredientId: 'ing-chicken-breast',
      expiryState: 'critical',
      isUserConfirmedDate: true,
      quantityUtilized: 300,
      unit: 'g',
      quantityUnresolved: false,
    });
    const codes = rec.reasons.map((r) => r.code);
    expect(codes).toContain('uses_expiring_ingredient');
    expect(codes).toContain('ready_now');
    expect(rec.reasons.find((r) => r.code === 'uses_expiring_ingredient')?.text).toBe(
      'Uses chicken breast expiring tomorrow',
    );
  });

  it('loads conversion metadata exactly once', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe('rv-a', [ing()]),
      recipe('rv-b', [ing(), ing({ ingredientId: 'ing-spinach', name: 'Spinach' })]),
    ]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);
    await run();
    expect(getConversionMetaMap).toHaveBeenCalledTimes(1);
  });

  it('respects the limit', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe('rv-1', [ing()]),
      recipe('rv-2', [ing()]),
      recipe('rv-3', [ing()]),
    ]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);
    const out = await recommendationService.getUseSoonRecommendations({ timeZone: 'UTC', now: NOW, limit: 2 });
    expect(out).toHaveLength(2);
  });
});

describe('getUseSoonRecommendations - planner interaction (soft dependency)', () => {
  it('adds "already planned" context when the recipe is scheduled within the window', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);
    repo.fetchMealPlanEntries.mockResolvedValue([planEntry({ scheduledDate: '2026-06-12' })]); // Friday

    const [rec] = await run();
    expect(rec.plannedDate).toBe('2026-06-12');
    expect(rec.reasons.find((r) => r.code === 'already_planned')?.text).toBe('Already planned for Friday');
  });

  it('flags "planned too late" when the urgent ingredient expires before the planned meal', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ estimatedExpirationDate: '2026-06-11', expirationConfidence: 'high' }),
    ]);
    repo.fetchMealPlanEntries.mockResolvedValue([planEntry({ scheduledDate: '2026-06-15' })]); // after 06-11

    const [rec] = await run();
    expect(rec.plannedAfterExpiryWarning).toBe(true);
    expect(rec.reasons.map((r) => r.code)).toContain('planned_after_expiry');
  });

  it('a planner failure degrades gracefully - recommendations are still produced', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);
    repo.fetchMealPlanEntries.mockRejectedValue(new Error('planner down'));

    const out = await run();
    expect(out).toHaveLength(1);
    expect(out[0].plannedDate).toBeUndefined();
    expect(out[0].reasons.map((r) => r.code)).not.toContain('already_planned');
  });
});

describe('getUseSoonRecommendations - error propagation', () => {
  it('propagates a recipe-catalog fetch failure', async () => {
    repo.fetchRecipeVersions.mockRejectedValue(new Error('catalog rls'));
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);
    await expect(run()).rejects.toThrow('catalog rls');
  });

  it('propagates a pantry fetch failure', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockRejectedValue(new Error('pantry rls'));
    await expect(run()).rejects.toThrow('pantry rls');
  });

  it('propagates a conversion-metadata failure', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe('rv-stirfry', [ing()])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);
    getConversionMetaMap.mockRejectedValue(new Error('nutrition auth'));
    await expect(run()).rejects.toThrow('nutrition auth');
  });
});
