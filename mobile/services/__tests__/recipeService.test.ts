import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { PantryItem, Recipe, RecipeIngredient } from '@/types';
import {
  getMissingIngredients,
  getRecipeAvailability,
  getRecipeShortfalls,
  recipeService,
} from '../recipeService';
import { nutritionService } from '../nutritionService';

jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getUser: jest.fn() } } }));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchRecipeVersions: jest.fn(),
  fetchRecipeVersionById: jest.fn(),
  fetchPantryItems: jest.fn(),
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

function ing(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', imageUri: '', quantity: 500, unit: 'g', ...overrides };
}

function recipe(ingredients: RecipeIngredient[]): Recipe {
  return {
    id: 'rv-1',
    recipeVersionId: 'rv-1',
    title: 'Test',
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
    collections: ['cook_right_now'],
  };
}

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    ingredientId: 'ing-chicken-breast',
    name: 'Chicken Breast',
    imageUri: '',
    category: 'protein',
    quantity: 200,
    unit: 'g',
    freshness: { score: 80, confidence: 0.9, label: 'fresh' },
    addedAt: 't',
    updatedAt: 't',
    source: 'manual',
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  getConversionMetaMap.mockResolvedValue(new Map<string, IngredientConversionMeta>());
  repo.fetchSavedRecipes.mockResolvedValue([]);
});

describe('hydrateRecipe (via getRecipes) - quantity-aware coverage', () => {
  it('exact same-unit fully covered -> isOwned true, coverage covered', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ quantity: 200, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem({ quantity: 500, unit: 'g' })]);

    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage?.status).toBe('covered');
    expect(r.ingredients[0].isOwned).toBe(true);
    expect(r.smartMatchScore).toBe(100);
  });

  it('multiple pantry lots for the same ingredient are summed', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ quantity: 500, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ quantity: 150, unit: 'g' }),
      pantryItem({ quantity: 200, unit: 'g' }),
    ]);

    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage).toMatchObject({ status: 'partial', availableQuantity: 350, shortfallQuantity: 150 });
    expect(r.ingredients[0].isOwned).toBe(false);
  });

  it('g + kg lots convert via the shared engine', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ quantity: 500, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem({ quantity: 0.2, unit: 'kg' })]);

    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage).toMatchObject({ status: 'partial', shortfallGrams: 300 });
  });

  it('completely missing when the pantry has no matching lot', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ ingredientId: 'ing-basil', name: 'Basil' })])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem()]);

    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage?.status).toBe('missing');
  });

  it('depleted / zero-quantity pantry lots are excluded', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ quantity: 100, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ quantity: 500, unit: 'g', status: 'depleted' }),
      pantryItem({ quantity: 0, unit: 'g' }),
    ]);

    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage?.status).toBe('missing');
  });

  it('unresolved (not missing) when a matching lot cannot be compared to the requirement', async () => {
    // recipe wants ml, the only lot is in g, and there is no density -> incomparable
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', quantity: 250, unit: 'ml' })])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem({ ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', quantity: 120, unit: 'g' })]);
    getConversionMetaMap.mockResolvedValue(new Map());

    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage?.status).toBe('unresolved');
    expect(r.ingredients[0].isOwned).toBe(false);
  });

  it('applies user/catalog conversion metadata from getConversionMetaMap', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ ingredientId: 'ing-garlic', name: 'Garlic', quantity: 30, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([pantryItem({ ingredientId: 'ing-garlic', name: 'Garlic', quantity: 4, unit: 'item' })]);
    getConversionMetaMap.mockResolvedValue(new Map([['ing-garlic', { gramsPerUnit: { item: 5 } }]]));

    const [r] = await recipeService.getRecipes();
    // 4 items * 5 g = 20 g available vs 30 g required
    expect(r.ingredients[0].coverage).toMatchObject({ status: 'partial', availableGrams: 20, shortfallGrams: 10 });
  });

  it('a pantry staple is always covered regardless of stock', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([recipe([ing({ ingredientId: 'ing-salt', name: 'Salt', isPantryStaple: true, quantity: 1, unit: 'g' })])]);
    repo.fetchPantryItems.mockResolvedValue([]);
    const [r] = await recipeService.getRecipes();
    expect(r.ingredients[0].coverage?.status).toBe('covered');
  });
});

describe('getMissingIngredients / getRecipeShortfalls / getRecipeAvailability', () => {
  it('getMissingIngredients returns ONLY status "missing" (not partial / unresolved)', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe([
        ing({ ingredientId: 'ing-a', name: 'A', quantity: 100, unit: 'g' }), // covered
        ing({ ingredientId: 'ing-b', name: 'B', quantity: 500, unit: 'g' }), // partial
        ing({ ingredientId: 'ing-c', name: 'C', quantity: 1, unit: 'g' }), // missing
        ing({ ingredientId: 'ing-d', name: 'D', quantity: 1, unit: 'ml' }), // unresolved (lot in g, no density)
      ]),
    ]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ ingredientId: 'ing-a', quantity: 200, unit: 'g' }),
      pantryItem({ ingredientId: 'ing-b', quantity: 200, unit: 'g' }),
      pantryItem({ ingredientId: 'ing-d', quantity: 120, unit: 'g' }),
    ]);

    const [r] = await recipeService.getRecipes();
    expect(getMissingIngredients(r).map((i) => i.ingredientId)).toEqual(['ing-c']);
    expect(getRecipeShortfalls(r).map((s) => s.coverage.status).sort()).toEqual(['missing', 'partial', 'unresolved']);
    expect(getRecipeAvailability(r)).toEqual({ owned: 1, total: 4 });
  });
});

describe('countReadyToCookRecipes - every non-staple ingredient must be covered', () => {
  it('a partially-covered ingredient means NOT ready', async () => {
    repo.fetchRecipeVersions.mockResolvedValue([
      recipe([ing({ ingredientId: 'ing-a', quantity: 100, unit: 'g' })]), // fully covered -> ready
      recipe([ing({ ingredientId: 'ing-b', quantity: 500, unit: 'g' })]), // partial -> not ready
    ]);
    repo.fetchPantryItems.mockResolvedValue([
      pantryItem({ ingredientId: 'ing-a', quantity: 999, unit: 'g' }),
      pantryItem({ ingredientId: 'ing-b', quantity: 100, unit: 'g' }),
    ]);

    expect(await recipeService.countReadyToCookRecipes()).toBe(1);
  });
});
