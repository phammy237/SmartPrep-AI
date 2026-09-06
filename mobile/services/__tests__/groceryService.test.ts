import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { IngredientCoverage } from '@/lib/nutrition/pantryCoverage';
import { GroceryListItem, RecipeIngredient } from '@/types';
import { groceryService } from '../groceryService';
import { db } from '../mockDb';
import { nutritionService } from '../nutritionService';
import type { RecipeShortfall } from '../recipeService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('../nutritionService', () => ({
  nutritionService: { getConversionMetaMap: jest.fn() },
}));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchActiveGroceryList: jest.fn(),
  fetchOrCreateActiveGroceryList: jest.fn(),
  fetchGroceryListItems: jest.fn(),
  insertGroceryListItem: jest.fn(),
  insertGroceryListItems: jest.fn(),
  updateGroceryListItem: jest.fn(),
  toggleGroceryListItemChecked: jest.fn(),
  deleteGroceryListItem: jest.fn(),
  deleteCheckedGroceryListItems: jest.fn(),
}));

const repo = repositories as jest.Mocked<typeof repositories>;
const getUser = supabase.auth.getUser as jest.Mock;

const LIST = { id: 'list-1', createdAt: '2026-09-01T00:00:00.000Z', status: 'active' as const };

function item(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    name: 'Thing',
    imageUri: '',
    category: 'other',
    quantity: 1,
    unit: 'item',
    isChecked: false,
    source: 'manual',
    quantityBasis: 'as_entered',
    ...overrides,
  };
}

const getConversionMetaMap = nutritionService.getConversionMetaMap as jest.Mock;

function shortfall(
  ingredient: Partial<RecipeIngredient>,
  coverage: Partial<IngredientCoverage>,
): RecipeShortfall {
  return {
    ingredient: {
      ingredientId: 'ing-parmesan',
      name: 'Parmesan',
      imageUri: 'https://example.com/p.jpg',
      quantity: 1,
      unit: 'package',
      ...ingredient,
    },
    coverage: {
      status: 'missing',
      ingredientId: ingredient.ingredientId ?? 'ing-parmesan',
      requiredQuantity: ingredient.quantity ?? 1,
      requiredUnit: ingredient.unit ?? 'package',
      matchedLotCount: 0,
      basis: 'no_lots',
      ...coverage,
    } as IngredientCoverage,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  repo.fetchOrCreateActiveGroceryList.mockResolvedValue(LIST);
  repo.fetchActiveGroceryList.mockResolvedValue({ id: LIST.id, createdAt: LIST.createdAt, items: [] });
  repo.fetchGroceryListItems.mockResolvedValue([]);
  repo.insertGroceryListItem.mockImplementation(async (_u, _l, p) => item({ name: p.displayName, quantity: p.quantity, unit: p.unit }));
  repo.insertGroceryListItems.mockImplementation(async (_u, _l, ps) => ps.map((p) => item({ name: p.displayName, quantity: p.quantity, unit: p.unit, source: p.source, quantityBasis: p.quantityBasis })));
  repo.updateGroceryListItem.mockImplementation(async (id, patch) => item({ id, quantity: patch.quantity ?? 1 }));
  repo.toggleGroceryListItemChecked.mockImplementation(async (id) => item({ id, isChecked: true }));
  getConversionMetaMap.mockResolvedValue(new Map());
});

describe('getGroceryList (fetch)', () => {
  it('returns the active list for the signed-in user', async () => {
    const result = await groceryService.getGroceryList();
    expect(result).toEqual({ id: 'list-1', createdAt: LIST.createdAt, items: [] });
    expect(repo.fetchActiveGroceryList).toHaveBeenCalledTimes(1);
  });

  it('throws before hitting the repository when there is no session (auth failure)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(groceryService.getGroceryList()).rejects.toThrow('Not signed in');
    expect(repo.fetchActiveGroceryList).not.toHaveBeenCalled();
  });

  it('propagates a Supabase failure instead of swallowing it', async () => {
    repo.fetchActiveGroceryList.mockRejectedValue(new Error('network down'));
    await expect(groceryService.getGroceryList()).rejects.toThrow('network down');
  });
});

describe('addGroceryItem (create)', () => {
  it('validates, resolves the active list, and inserts a manual as_entered line', async () => {
    await groceryService.addGroceryItem({ name: '  Coffee ', category: 'other', quantity: 2, unit: 'bag' });

    expect(repo.fetchOrCreateActiveGroceryList).toHaveBeenCalled();
    expect(repo.insertGroceryListItem).toHaveBeenCalledWith(
      'user-1',
      'list-1',
      expect.objectContaining({
        displayName: 'Coffee',
        category: 'other',
        quantity: 2,
        unit: 'bag',
        source: 'manual',
        quantityBasis: 'as_entered',
      }),
    );
  });

  it('rejects an empty name / non-positive quantity and never inserts', async () => {
    await expect(groceryService.addGroceryItem({ name: '   ', category: 'other', quantity: 1, unit: 'item' })).rejects.toBeInstanceOf(Error);
    await expect(groceryService.addGroceryItem({ name: 'X', category: 'other', quantity: 0, unit: 'item' })).rejects.toBeInstanceOf(Error);
    expect(repo.insertGroceryListItem).not.toHaveBeenCalled();
  });

  it('passes the authenticated user id (never a caller-supplied one) as the item owner', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'the-real-user' } }, error: null });
    await groceryService.addGroceryItem({ name: 'Milk', category: 'dairy', quantity: 1, unit: 'container' });
    expect(repo.insertGroceryListItem).toHaveBeenCalledWith('the-real-user', 'list-1', expect.any(Object));
  });

  it('propagates a Supabase insert failure', async () => {
    repo.insertGroceryListItem.mockRejectedValue(new Error('check constraint'));
    await expect(groceryService.addGroceryItem({ name: 'X', category: 'other', quantity: 1, unit: 'item' })).rejects.toThrow('check constraint');
  });
});

describe('updateGroceryItem (update)', () => {
  it('validates the patch and forwards it to the repository', async () => {
    await groceryService.updateGroceryItem('item-9', { quantity: 4, displayName: 'Big Milk' });
    expect(repo.updateGroceryListItem).toHaveBeenCalledWith('item-9', { quantity: 4, displayName: 'Big Milk' });
  });

  it('rejects an empty patch', async () => {
    await expect(groceryService.updateGroceryItem('item-9', {})).rejects.toBeInstanceOf(Error);
    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
  });
});

describe('toggleGroceryItem (toggle)', () => {
  it('delegates to the toggle RPC repository fn', async () => {
    await groceryService.toggleGroceryItem('item-3');
    expect(repo.toggleGroceryListItemChecked).toHaveBeenCalledWith('item-3');
  });

  it('does not touch the pantry (no pantry repository fn is even importable here)', () => {
    expect((repositories as Record<string, unknown>).adjustPantryQuantity).toBeUndefined();
    expect((repositories as Record<string, unknown>).createPantryItem).toBeUndefined();
  });

  it('requires a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(groceryService.toggleGroceryItem('item-3')).rejects.toThrow('Not signed in');
    expect(repo.toggleGroceryListItemChecked).not.toHaveBeenCalled();
  });
});

describe('removeGroceryItem (delete)', () => {
  it('delegates to deleteGroceryListItem', async () => {
    await groceryService.removeGroceryItem('item-4');
    expect(repo.deleteGroceryListItem).toHaveBeenCalledWith('item-4');
  });

  it('propagates a Supabase delete failure', async () => {
    repo.deleteGroceryListItem.mockRejectedValue(new Error('rls'));
    await expect(groceryService.removeGroceryItem('item-4')).rejects.toThrow('rls');
  });
});

describe('clearCheckedItems (clear checked)', () => {
  it('resolves the active list and clears its checked items', async () => {
    await groceryService.clearCheckedItems();
    expect(repo.fetchOrCreateActiveGroceryList).toHaveBeenCalled();
    expect(repo.deleteCheckedGroceryListItems).toHaveBeenCalledWith('list-1');
  });

  it('requires a session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(groceryService.clearCheckedItems()).rejects.toThrow('Not signed in');
    expect(repo.deleteCheckedGroceryListItems).not.toHaveBeenCalled();
  });
});

describe('addRecipeShortfallsToGroceryList - line shape per coverage status', () => {
  it('missing -> full recipe_requirement line', async () => {
    const rows = await groceryService.addRecipeShortfallsToGroceryList('rv-42', [
      shortfall({ ingredientId: 'ing-parmesan', name: 'Parmesan', quantity: 2, unit: 'package' }, { status: 'missing', requiredQuantity: 2, requiredUnit: 'package' }),
    ]);
    const [, , inserted] = repo.insertGroceryListItems.mock.calls[0];
    expect(inserted[0]).toMatchObject({
      catalogIngredientId: 'ing-parmesan',
      quantity: 2,
      unit: 'package',
      source: 'recipe',
      quantityBasis: 'recipe_requirement',
      sourceRecipeVersionIds: ['rv-42'],
      sourceMetadata: { coverage: 'missing' },
    });
    expect(rows).toHaveLength(1);
  });

  it('partial (same-unit) -> uncovered_shortfall line for just the gap, in the recipe unit', async () => {
    await groceryService.addRecipeShortfallsToGroceryList('rv-1', [
      shortfall(
        { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', quantity: 500, unit: 'g' },
        { status: 'partial', requiredQuantity: 500, requiredUnit: 'g', availableQuantity: 200, shortfallQuantity: 300, shortfallUnit: 'g', basis: 'same_unit', matchedLotCount: 1 },
      ),
    ]);
    const [, , inserted] = repo.insertGroceryListItems.mock.calls[0];
    expect(inserted[0]).toMatchObject({ quantity: 300, unit: 'g', quantityBasis: 'uncovered_shortfall' });
  });

  it('partial (grams) -> shortfall converted back into the recipe unit when deterministic (2 lb - 1 lb = 1 lb)', async () => {
    await groceryService.addRecipeShortfallsToGroceryList('rv-1', [
      shortfall(
        { ingredientId: 'ing-ground-beef', name: 'Ground Beef', quantity: 2, unit: 'lb' },
        { status: 'partial', requiredQuantity: 2, requiredUnit: 'lb', basis: 'grams', shortfallGrams: 453.59237, matchedLotCount: 1 },
      ),
    ]);
    const [, , inserted] = repo.insertGroceryListItems.mock.calls[0];
    expect(inserted[0].unit).toBe('lb');
    expect(inserted[0].quantity).toBeCloseTo(1, 5);
    expect(inserted[0].quantityBasis).toBe('uncovered_shortfall');
  });

  it('unresolved -> conservative full recipe_requirement line, never a silent subtraction', async () => {
    // recipe in ml, pantry lot in g, no density -> can't compare -> unresolved
    await groceryService.addRecipeShortfallsToGroceryList('rv-1', [
      shortfall(
        { ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', quantity: 250, unit: 'ml' },
        { status: 'unresolved', requiredQuantity: 250, requiredUnit: 'ml', basis: 'unresolved', reason: 'missing_density', matchedLotCount: 1 },
      ),
    ]);
    const [, , inserted] = repo.insertGroceryListItems.mock.calls[0];
    expect(inserted[0]).toMatchObject({ quantity: 250, unit: 'ml', quantityBasis: 'recipe_requirement', sourceMetadata: { coverage: 'unresolved', reason: 'missing_density' } });
  });

  it('covered ingredients produce no grocery line and no silent demand loss elsewhere', async () => {
    const rows = await groceryService.addRecipeShortfallsToGroceryList('rv-1', [
      shortfall({ ingredientId: 'ing-x', quantity: 1, unit: 'g' }, { status: 'covered', basis: 'same_unit' }),
    ]);
    expect(rows).toEqual([]);
    expect(repo.insertGroceryListItems).not.toHaveBeenCalled();
  });

  it('never writes to the in-memory mock db', async () => {
    await groceryService.addRecipeShortfallsToGroceryList('rv-1', [shortfall({}, {})]);
    expect((db as unknown as Record<string, unknown>).groceryList).toBeUndefined();
  });
});

describe('addRecipeShortfallsToGroceryList - merge rules', () => {
  it('merges same canonical id + same unit + same quantity_basis into an unchecked generated line, preserving provenance', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', unit: 'g', quantity: 200, isChecked: false, source: 'recipe', quantityBasis: 'uncovered_shortfall', sourceRecipeIds: ['rv-A'] }),
    ]);

    await groceryService.addRecipeShortfallsToGroceryList('rv-B', [
      shortfall(
        { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', quantity: 500, unit: 'g' },
        { status: 'partial', requiredQuantity: 500, requiredUnit: 'g', shortfallQuantity: 300, shortfallUnit: 'g', basis: 'same_unit', matchedLotCount: 1 },
      ),
    ]);

    expect(repo.updateGroceryListItem).toHaveBeenCalledWith('g1', { quantity: 500, sourceRecipeVersionIds: ['rv-A', 'rv-B'] });
    expect(repo.insertGroceryListItems).not.toHaveBeenCalled();
  });

  it('does NOT merge a shortfall line into a recipe_requirement line (different basis)', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', unit: 'g', quantity: 500, isChecked: false, source: 'recipe', quantityBasis: 'recipe_requirement' }),
    ]);
    await groceryService.addRecipeShortfallsToGroceryList('rv-B', [
      shortfall(
        { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', quantity: 500, unit: 'g' },
        { status: 'partial', requiredQuantity: 500, requiredUnit: 'g', shortfallQuantity: 300, shortfallUnit: 'g', basis: 'same_unit', matchedLotCount: 1 },
      ),
    ]);
    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
    expect(repo.insertGroceryListItems.mock.calls[0][2]).toHaveLength(1);
  });

  it('does NOT merge across incompatible units, and never converts them', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', unit: 'ml', quantity: 100, isChecked: false, source: 'recipe', quantityBasis: 'recipe_requirement' }),
    ]);
    await groceryService.addRecipeShortfallsToGroceryList('rv-B', [
      shortfall({ ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', quantity: 1, unit: 'L' }, { status: 'missing', requiredQuantity: 1, requiredUnit: 'L' }),
    ]);
    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
    expect(repo.insertGroceryListItems.mock.calls[0][2][0]).toMatchObject({ unit: 'L', quantity: 1 });
  });

  it('does NOT touch manual (as_entered) or checked lines', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'm1', ingredientId: 'ing-parmesan', name: 'Parmesan', unit: 'package', quantity: 1, isChecked: false, source: 'manual', quantityBasis: 'as_entered' }),
      item({ id: 'c1', ingredientId: 'ing-parmesan', name: 'Parmesan', unit: 'package', quantity: 1, isChecked: true, source: 'recipe', quantityBasis: 'recipe_requirement' }),
    ]);
    await groceryService.addRecipeShortfallsToGroceryList('rv-B', [
      shortfall({ ingredientId: 'ing-parmesan', name: 'Parmesan', quantity: 1, unit: 'package' }, { status: 'missing', requiredQuantity: 1, requiredUnit: 'package' }),
    ]);
    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
    expect(repo.insertGroceryListItems.mock.calls[0][2]).toHaveLength(1);
  });

  it('two shortfalls for the same ingredient in one call fold into a single line (200 g + 300 g -> 500 g)', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([]);
    await groceryService.addRecipeShortfallsToGroceryList('rv-1', [
      shortfall({ ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', quantity: 200, unit: 'g' }, { status: 'missing', requiredQuantity: 200, requiredUnit: 'g' }),
      shortfall({ ingredientId: 'ing-chicken-breast', name: 'Chicken Breast', quantity: 300, unit: 'g' }, { status: 'missing', requiredQuantity: 300, requiredUnit: 'g' }),
    ]);
    const insertedRows = repo.insertGroceryListItems.mock.calls[0][2];
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].quantity).toBe(500);
  });
});
