import { supabase } from '../../client';
import {
  deleteCheckedGroceryListItems,
  deleteGroceryListItem,
  fetchGroceryListItems,
  fetchOrCreateActiveGroceryList,
  insertGroceryListItem,
  insertGroceryListItems,
  toggleGroceryListItemChecked,
  updateGroceryListItem,
} from '../groceryRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

type Result = { data: unknown; error: unknown };

/** A chain where every builder method returns the chain, the chain itself is
 *  awaitable, and `.single()`/`.maybeSingle()` resolve too. */
function makeChain(result: Result) {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {};
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    chain[m] = jest.fn(() => chain);
  }
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  (chain as { then: unknown }).then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const LIST_ROW = {
  id: 'list-1',
  user_id: 'user-1',
  title: 'Grocery List',
  status: 'active' as const,
  source: 'manual' as const,
  source_metadata: {},
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const ITEM_ROW = {
  id: 'item-1',
  grocery_list_id: 'list-1',
  user_id: 'user-1',
  catalog_ingredient_id: 'ing-parmesan',
  display_name: 'Parmesan',
  normalized_name: 'parmesan',
  image_uri: 'https://example.com/parmesan.jpg',
  category: 'dairy' as const,
  quantity: 1,
  unit: 'package' as const,
  quantity_basis: 'recipe_requirement' as const,
  is_checked: false,
  checked_at: null,
  source: 'recipe' as const,
  source_recipe_version_ids: ['rv-1'],
  source_metadata: {},
  estimated_price: null,
  swap_suggestion: null,
  waste_note: null,
  sort_order: 1,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

describe('fetchOrCreateActiveGroceryList', () => {
  it('calls the RPC and maps the header', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: LIST_ROW, error: null });

    const header = await fetchOrCreateActiveGroceryList();

    expect(supabase.rpc).toHaveBeenCalledWith('get_or_create_active_grocery_list');
    expect(header).toEqual({ id: 'list-1', createdAt: '2026-09-01T00:00:00.000Z', status: 'active' });
  });

  it('throws when the RPC errors', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('rls denied') });
    await expect(fetchOrCreateActiveGroceryList()).rejects.toThrow('rls denied');
  });

  it('throws when the RPC returns no row', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    await expect(fetchOrCreateActiveGroceryList()).rejects.toThrow(/active grocery list/);
  });
});

describe('fetchGroceryListItems', () => {
  it('orders by sort_order then created_at then id, and maps rows', async () => {
    const chain = makeChain({ data: [ITEM_ROW, { ...ITEM_ROW, id: 'item-2', category: null, catalog_ingredient_id: null, source: 'manual', source_recipe_version_ids: [] }], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const items = await fetchGroceryListItems('list-1');

    expect(supabase.from).toHaveBeenCalledWith('grocery_list_items');
    expect(chain.eq).toHaveBeenCalledWith('grocery_list_id', 'list-1');
    expect(chain.order.mock.calls).toEqual([
      ['sort_order', { ascending: true }],
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(items[0]).toMatchObject({ id: 'item-1', ingredientId: 'ing-parmesan', category: 'dairy', isManuallyAdded: undefined, source: 'recipe', quantityBasis: 'recipe_requirement', sourceRecipeIds: ['rv-1'] });
    // nullable category -> 'other'; no catalog id -> undefined; empty recipe ids -> undefined; manual -> isManuallyAdded true
    expect(items[1]).toMatchObject({ id: 'item-2', category: 'other', ingredientId: undefined, sourceRecipeIds: undefined, isManuallyAdded: true });
  });

  it('propagates a supabase error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: null, error: new Error('boom') }));
    await expect(fetchGroceryListItems('list-1')).rejects.toThrow('boom');
  });
});

describe('insertGroceryListItems', () => {
  it('returns [] without hitting supabase for an empty batch', async () => {
    const result = await insertGroceryListItems('user-1', 'list-1', []);
    expect(result).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('builds rows with defaults and maps the result', async () => {
    const chain = makeChain({ data: [ITEM_ROW], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await insertGroceryListItems('user-1', 'list-1', [
      { displayName: 'Parmesan', quantity: 1, unit: 'package', catalogIngredientId: 'ing-parmesan', category: 'dairy', source: 'recipe', sourceRecipeVersionIds: ['rv-1'], quantityBasis: 'recipe_requirement' },
    ]);

    const rows = (chain.insert as jest.Mock).mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      grocery_list_id: 'list-1',
      user_id: 'user-1',
      catalog_ingredient_id: 'ing-parmesan',
      display_name: 'Parmesan',
      category: 'dairy',
      quantity: 1,
      unit: 'package',
      source: 'recipe',
      source_recipe_version_ids: ['rv-1'],
      quantity_basis: 'recipe_requirement',
    });
    // trigger-managed columns are never sent by the client
    expect(rows[0]).not.toHaveProperty('normalized_name');
    expect(rows[0]).not.toHaveProperty('checked_at');
    expect(rows[0]).not.toHaveProperty('sort_order');
  });

  it('defaults source=manual / quantity_basis=as_entered / category=null when omitted', async () => {
    const chain = makeChain({ data: [ITEM_ROW], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await insertGroceryListItem('user-1', 'list-1', { displayName: 'Coffee', quantity: 1, unit: 'bag' });

    const rows = (chain.insert as jest.Mock).mock.calls[0][0];
    expect(rows[0]).toMatchObject({ source: 'manual', quantity_basis: 'as_entered', category: null, source_recipe_version_ids: [] });
  });

  it('propagates a supabase insert error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: null, error: new Error('unit check violation') }));
    await expect(
      insertGroceryListItem('user-1', 'list-1', { displayName: 'X', quantity: 1, unit: 'item' }),
    ).rejects.toThrow('unit check violation');
  });
});

describe('updateGroceryListItem', () => {
  it('only sends the columns actually passed and never is_checked / user_id', async () => {
    const chain = makeChain({ data: { ...ITEM_ROW, quantity: 3 }, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await updateGroceryListItem('item-1', { quantity: 3, sourceRecipeVersionIds: ['rv-1', 'rv-2'] });

    expect(chain.update).toHaveBeenCalledWith({ quantity: 3, source_recipe_version_ids: ['rv-1', 'rv-2'] });
    expect(chain.eq).toHaveBeenCalledWith('id', 'item-1');
    const payload = (chain.update as jest.Mock).mock.calls[0][0];
    expect(payload).not.toHaveProperty('is_checked');
    expect(payload).not.toHaveProperty('user_id');
    expect(payload).not.toHaveProperty('grocery_list_id');
  });
});

describe('toggleGroceryListItemChecked', () => {
  it('calls the toggle RPC with the item id', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { ...ITEM_ROW, is_checked: true, checked_at: '2026-09-02T00:00:00.000Z' }, error: null });

    const item = await toggleGroceryListItemChecked('item-1');

    expect(supabase.rpc).toHaveBeenCalledWith('toggle_grocery_item', { p_item_id: 'item-1' });
    expect(item.isChecked).toBe(true);
  });

  it('propagates the "not found" RPC error (cross-user / missing id)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('grocery item not found') });
    await expect(toggleGroceryListItemChecked('someone-elses-item')).rejects.toThrow('grocery item not found');
  });
});

describe('deleteGroceryListItem / deleteCheckedGroceryListItems', () => {
  it('deletes a single item by id', async () => {
    const chain = makeChain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await deleteGroceryListItem('item-1');

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'item-1');
  });

  it('deletes only checked items in a list', async () => {
    const chain = makeChain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await deleteCheckedGroceryListItems('list-1');

    expect(chain.eq.mock.calls).toEqual([
      ['grocery_list_id', 'list-1'],
      ['is_checked', true],
    ]);
  });

  it('propagates a delete error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(makeChain({ data: null, error: new Error('nope') }));
    await expect(deleteGroceryListItem('item-1')).rejects.toThrow('nope');
  });
});
