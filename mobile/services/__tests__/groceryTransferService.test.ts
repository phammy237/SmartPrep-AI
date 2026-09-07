import { supabase } from '@/lib/supabase/client';
import { GroceryListItem } from '@/types';
import { GroceryTransferItemInput } from '@/lib/validation/grocerySchemas';
import { groceryTransferService } from '../groceryTransferService';
import { pantryService } from '../pantryService';

jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getUser: jest.fn() } } }));
jest.mock('../pantryService', () => ({
  pantryService: { createGroceryTransferItem: jest.fn() },
}));

const getUser = supabase.auth.getUser as jest.Mock;
const createGroceryTransferItem = pantryService.createGroceryTransferItem as jest.Mock;

function groceryItem(over: Partial<GroceryListItem> = {}): GroceryListItem {
  return {
    id: `gi-${Math.random().toString(36).slice(2)}`,
    ingredientId: 'ing-chicken-breast',
    name: 'Chicken Breast',
    imageUri: 'x',
    category: 'protein',
    quantity: 300,
    unit: 'g',
    isChecked: true,
    source: 'recipe',
    quantityBasis: 'recipe_requirement',
    pantryTransferStatus: 'not_transferred',
    ...over,
  };
}

function input(over: Partial<GroceryTransferItemInput> = {}): GroceryTransferItemInput {
  return {
    groceryItemId: 'gi-1',
    ingredientId: 'ing-chicken-breast',
    displayName: 'Chicken Breast',
    imageUri: 'x',
    category: 'protein',
    quantity: 1,
    unit: 'lb',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  createGroceryTransferItem.mockImplementation(async (i: GroceryTransferItemInput) => ({
    id: `lot-${i.groceryItemId}`,
    ingredientId: i.ingredientId ?? 'ing-x',
    name: i.displayName,
    imageUri: i.imageUri,
    category: i.category,
    quantity: i.quantity,
    unit: i.unit,
    freshness: { score: 80, confidence: 0.8, label: 'fresh' },
    addedAt: 't',
    updatedAt: 't',
    source: 'grocery',
  }));
});

describe('getTransferableGroceryItems (candidate filter - checked AND not yet transferred)', () => {
  it('includes only checked, not-transferred lines', () => {
    const items = [
      groceryItem({ id: 'a', isChecked: true, pantryTransferStatus: 'not_transferred' }),
      groceryItem({ id: 'b', isChecked: false }),
      groceryItem({ id: 'c', isChecked: true, pantryTransferStatus: 'transferred' }),
    ];
    expect(groceryTransferService.getTransferableGroceryItems(items).map((i) => i.id)).toEqual(['a']);
  });
});

describe('groceryLineToTransferInput (pre-fill from the grocery line)', () => {
  it('copies id / identity / name / quantity / unit / image', () => {
    const line = groceryItem({ id: 'gi-9', ingredientId: 'ing-milk', name: 'Milk', quantity: 2, unit: 'L' });
    expect(groceryTransferService.groceryLineToTransferInput(line)).toEqual({
      groceryItemId: 'gi-9',
      ingredientId: 'ing-milk',
      displayName: 'Milk',
      imageUri: 'x',
      category: 'protein',
      quantity: 2,
      unit: 'L',
    });
  });

  it('leaves ingredientId undefined when the line had no catalog id', () => {
    expect(groceryTransferService.groceryLineToTransferInput(groceryItem({ ingredientId: undefined })).ingredientId).toBeUndefined();
  });
});

describe('transferItemsToPantry', () => {
  it('requires a session and never calls the pantry path when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(groceryTransferService.transferItemsToPantry([input()])).rejects.toThrow('Not signed in');
    expect(createGroceryTransferItem).not.toHaveBeenCalled();
  });

  it('transfers one reviewed line into the pantry', async () => {
    const result = await groceryTransferService.transferItemsToPantry([input({ groceryItemId: 'gi-1' })], 'UTC');
    expect(createGroceryTransferItem).toHaveBeenCalledTimes(1);
    expect(createGroceryTransferItem).toHaveBeenCalledWith(expect.objectContaining({ groceryItemId: 'gi-1' }), 'UTC');
    expect(result.transferred).toEqual([{ groceryItemId: 'gi-1', pantryItem: expect.objectContaining({ id: 'lot-gi-1' }) }]);
    expect(result.failed).toEqual([]);
  });

  it('transfers exactly the subset it is given (the screen passes only the selected lines)', async () => {
    const result = await groceryTransferService.transferItemsToPantry(
      [input({ groceryItemId: 'gi-1' }), input({ groceryItemId: 'gi-3' })],
      'UTC',
    );
    expect(createGroceryTransferItem.mock.calls.map((c) => c[0].groceryItemId)).toEqual(['gi-1', 'gi-3']);
    expect(result.transferred).toHaveLength(2);
  });

  it('uses the edited quantity + unit + name, not the grocery line values', async () => {
    await groceryTransferService.transferItemsToPantry(
      [input({ groceryItemId: 'gi-1', quantity: 1, unit: 'lb', displayName: 'Boneless Chicken' })],
      'UTC',
    );
    expect(createGroceryTransferItem).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 1, unit: 'lb', displayName: 'Boneless Chicken' }),
      'UTC',
    );
  });

  it('carries the canonical ingredient id forward', async () => {
    await groceryTransferService.transferItemsToPantry([input({ ingredientId: 'ing-milk' })], 'UTC');
    expect(createGroceryTransferItem).toHaveBeenCalledWith(expect.objectContaining({ ingredientId: 'ing-milk' }), 'UTC');
  });

  it('accepts a line with no catalog id (identity fallback happens downstream)', async () => {
    const result = await groceryTransferService.transferItemsToPantry(
      [input({ groceryItemId: 'gi-x', ingredientId: undefined, displayName: 'Homemade Kimchi' })],
      'UTC',
    );
    expect(result.failed).toEqual([]);
    expect(createGroceryTransferItem).toHaveBeenCalledWith(
      expect.not.objectContaining({ ingredientId: expect.any(String) }),
      'UTC',
    );
  });

  it('rejects invalid input before any transfer (empty id / non-positive quantity)', async () => {
    await expect(
      groceryTransferService.transferItemsToPantry([input({ groceryItemId: '' })]),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      groceryTransferService.transferItemsToPantry([input({ quantity: 0 })]),
    ).rejects.toBeInstanceOf(Error);
    expect(createGroceryTransferItem).not.toHaveBeenCalled();
  });

  it('honest partial failure: the ones that worked are in `transferred`, the rest in `failed`', async () => {
    createGroceryTransferItem
      .mockImplementationOnce(async (i) => ({ id: `lot-${i.groceryItemId}`, source: 'grocery' }))
      .mockRejectedValueOnce(new Error('rls'))
      .mockImplementationOnce(async (i) => ({ id: `lot-${i.groceryItemId}`, source: 'grocery' }));

    const result = await groceryTransferService.transferItemsToPantry(
      [input({ groceryItemId: 'a' }), input({ groceryItemId: 'b' }), input({ groceryItemId: 'c' })],
      'UTC',
    );

    expect(result.transferred.map((t) => t.groceryItemId)).toEqual(['a', 'c']);
    expect(result.failed.map((f) => f.groceryItemId)).toEqual(['b']);
    expect((result.failed[0].error as Error).message).toBe('rls');
  });

  it('retry of only the failed line succeeds and does not re-run the successful ones', async () => {
    createGroceryTransferItem.mockRejectedValueOnce(new Error('timeout'));
    const first = await groceryTransferService.transferItemsToPantry(
      [input({ groceryItemId: 'a' }), input({ groceryItemId: 'b' })],
      'UTC',
    );
    expect(first.failed.map((f) => f.groceryItemId)).toEqual(['a']);

    createGroceryTransferItem.mockClear();
    const retry = await groceryTransferService.transferItemsToPantry([input({ groceryItemId: 'a' })], 'UTC');
    expect(createGroceryTransferItem).toHaveBeenCalledTimes(1);
    expect(retry.transferred.map((t) => t.groceryItemId)).toEqual(['a']);
    expect(retry.failed).toEqual([]);
  });

  it('a duplicate retry returns the SAME pantry item (idempotent per grocery line)', async () => {
    // the RPC (mocked here at createGroceryTransferItem) returns the existing lot on a repeat
    createGroceryTransferItem.mockResolvedValue({ id: 'lot-existing', source: 'grocery' });
    const run1 = await groceryTransferService.transferItemsToPantry([input({ groceryItemId: 'gi-1' })], 'UTC');
    const run2 = await groceryTransferService.transferItemsToPantry([input({ groceryItemId: 'gi-1' })], 'UTC');
    expect(run1.transferred[0].pantryItem).toEqual(run2.transferred[0].pantryItem);
    expect(run2.transferred[0].pantryItem).toMatchObject({ id: 'lot-existing' });
  });

  it('propagates the shape of a Supabase error through `failed` (e.g. "not marked as acquired")', async () => {
    createGroceryTransferItem.mockRejectedValue(new Error('grocery item is not marked as acquired'));
    const result = await groceryTransferService.transferItemsToPantry([input({ groceryItemId: 'gi-1' })], 'UTC');
    expect(result.transferred).toEqual([]);
    expect((result.failed[0].error as Error).message).toMatch(/not marked as acquired/);
  });

  it('an empty input list is a no-op', async () => {
    await expect(groceryTransferService.transferItemsToPantry([])).resolves.toEqual({ transferred: [], failed: [] });
    expect(createGroceryTransferItem).not.toHaveBeenCalled();
  });
});
