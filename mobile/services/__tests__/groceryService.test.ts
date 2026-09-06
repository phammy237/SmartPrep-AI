import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { GroceryListItem, RecipeIngredient } from '@/types';
import { groceryService } from '../groceryService';
import { db } from '../mockDb';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
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

function missing(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    ingredientId: 'ing-parmesan',
    name: 'Parmesan',
    imageUri: 'https://example.com/p.jpg',
    quantity: 1,
    unit: 'package',
    ...overrides,
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

describe('addMissingIngredientsForRecipe (generated list persistence)', () => {
  it('persists brand-new missing ingredients as recipe_requirement lines via the repository', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([]);

    const result = await groceryService.addMissingIngredientsForRecipe('rv-42', [
      missing({ ingredientId: 'ing-parmesan', name: 'Parmesan', quantity: 1, unit: 'package' }),
      missing({ ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', quantity: 120, unit: 'ml' }),
    ]);

    expect(repo.insertGroceryListItems).toHaveBeenCalledTimes(1);
    const [, , rows] = repo.insertGroceryListItems.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      catalogIngredientId: 'ing-parmesan',
      displayName: 'Parmesan',
      quantity: 1,
      unit: 'package',
      source: 'recipe',
      quantityBasis: 'recipe_requirement',
      sourceRecipeVersionIds: ['rv-42'],
    });
    expect(result).toHaveLength(2);
    // no merge attempted
    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
  });

  it('never writes to the in-memory mock db (no grocery bucket exists on it anymore)', async () => {
    await groceryService.addMissingIngredientsForRecipe('rv-1', [missing()]);
    expect(Object.keys(db)).not.toContain('groceryList');
    expect((db as unknown as Record<string, unknown>).groceryList).toBeUndefined();
  });
});

describe('addMissingIngredientsForRecipe (incompatible-unit behavior)', () => {
  it('merges quantities ONLY into an unchecked recipe_requirement line with the exact same unit', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-parmesan', name: 'Parmesan', unit: 'package', quantity: 1, isChecked: false, source: 'recipe', quantityBasis: 'recipe_requirement', sourceRecipeIds: ['rv-1'] }),
    ]);

    await groceryService.addMissingIngredientsForRecipe('rv-2', [missing({ ingredientId: 'ing-parmesan', unit: 'package', quantity: 2 })]);

    expect(repo.updateGroceryListItem).toHaveBeenCalledWith('g1', {
      quantity: 3,
      sourceRecipeVersionIds: ['rv-1', 'rv-2'],
    });
    // pure merge - nothing new to insert
    expect(repo.insertGroceryListItems).not.toHaveBeenCalled();
  });

  it('does NOT merge across incompatible units - it adds a separate line and never converts', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', unit: 'ml', quantity: 100, isChecked: false, source: 'recipe', quantityBasis: 'recipe_requirement' }),
    ]);

    await groceryService.addMissingIngredientsForRecipe('rv-2', [missing({ ingredientId: 'ing-heavy-cream', name: 'Heavy Cream', unit: 'L', quantity: 1 })]);

    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
    const [, , rows] = repo.insertGroceryListItems.mock.calls[0];
    expect(rows).toEqual([expect.objectContaining({ catalogIngredientId: 'ing-heavy-cream', unit: 'L', quantity: 1, quantityBasis: 'recipe_requirement' })]);
  });

  it('does NOT merge into a manual (as_entered) line even when the unit matches', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-parmesan', name: 'Parmesan', unit: 'package', quantity: 1, isChecked: false, source: 'manual', quantityBasis: 'as_entered' }),
    ]);

    await groceryService.addMissingIngredientsForRecipe('rv-2', [missing({ ingredientId: 'ing-parmesan', unit: 'package', quantity: 1 })]);

    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
    expect(repo.insertGroceryListItems.mock.calls[0][2]).toHaveLength(1);
  });

  it('does NOT merge into an already-checked line', async () => {
    repo.fetchGroceryListItems.mockResolvedValue([
      item({ id: 'g1', ingredientId: 'ing-parmesan', name: 'Parmesan', unit: 'package', quantity: 1, isChecked: true, source: 'recipe', quantityBasis: 'recipe_requirement' }),
    ]);

    await groceryService.addMissingIngredientsForRecipe('rv-2', [missing({ ingredientId: 'ing-parmesan', unit: 'package', quantity: 1 })]);

    expect(repo.updateGroceryListItem).not.toHaveBeenCalled();
    expect(repo.insertGroceryListItems.mock.calls[0][2]).toHaveLength(1);
  });
});
