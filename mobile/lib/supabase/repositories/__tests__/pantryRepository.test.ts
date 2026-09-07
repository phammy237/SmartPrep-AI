import { supabase } from '../../client';
import {
  adjustPantryQuantity,
  confirmPantryItem,
  createPantryItem,
  depletePantryItem,
  fetchPantryItem,
  fetchPantryItems,
  restorePantryItem,
  transferGroceryItemToPantry,
  updatePantryItemMetadata,
} from '../pantryRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

type Chain = Record<string, jest.Mock> & { maybeSingle?: jest.Mock; single?: jest.Mock };

function mockChain(resolvedValue: { data: unknown; error: unknown }, terminal: 'select' | 'maybeSingle' | 'single' = 'select'): Chain {
  const chain: Chain = {};
  (['select', 'eq', 'update'] as const).forEach((method) => {
    chain[method] = jest.fn(() => chain);
  });
  chain.maybeSingle = jest.fn(() => Promise.resolve(resolvedValue));
  chain.single = jest.fn(() => Promise.resolve(resolvedValue));
  if (terminal === 'select') {
    // A bare `.select('*').eq(...)` (no `.single()`/`.maybeSingle()`) resolves
    // when awaited directly - simulate that by making `eq` itself thenable.
    const thenable = Object.assign(Promise.resolve(resolvedValue), chain);
    chain.eq = jest.fn(() => thenable);
  }
  return chain;
}

const BASE_ROW = {
  id: 'item-1',
  user_id: 'user-1',
  ingredient_id: 'ing-manual-1',
  image_uri: 'https://example.com/photo.jpg',
  normalized_name: 'milk',
  display_name: 'Milk',
  category: 'dairy' as const,
  quantity: 1,
  unit: 'item' as const,
  quantity_confidence: 'exact' as const,
  estimated_grams: null,
  fdc_id: null,
  usda_match_confidence: null,
  barcode: null,
  brand: null,
  purchase_date: '2026-08-10',
  opened_date: null,
  user_provided_date: null,
  user_provided_date_type: null,
  estimated_expiration_date: '2026-08-30',
  expiration_confidence: 'medium' as const,
  storage_location: 'fridge' as const,
  scan_source: 'manual' as const,
  notes: null,
  status: 'active' as const,
  last_confirmed_at: null,
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z',
};

describe('fetchPantryItems', () => {
  it('maps rows and derives freshness from estimated_expiration_date + confidence', async () => {
    const chain = mockChain({ data: [BASE_ROW], error: null }, 'select');
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchPantryItems('user-1', 'UTC');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Milk');
    expect(result[0].status).toBe('active');
    expect(result[0].storageLocation).toBe('fridge');
    expect(result[0].purchaseDate).toBe('2026-08-10');
    expect(result[0].freshness.label).toBeDefined();
    expect(result[0].freshness.estimatedUseBy).toMatch(/Estimated around/);
  });

  it('propagates a supabase error', async () => {
    const chain = mockChain({ data: null, error: new Error('boom') }, 'select');
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(fetchPantryItems('user-1', 'UTC')).rejects.toThrow('boom');
  });
});

describe('fetchPantryItem', () => {
  it('returns null when no matching row exists', async () => {
    const chain = mockChain({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    expect(await fetchPantryItem('missing', 'UTC')).toBeNull();
  });

  it('maps a single row', async () => {
    const chain = mockChain({ data: BASE_ROW, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await fetchPantryItem('item-1', 'UTC');
    expect(result?.id).toBe('item-1');
  });
});

describe('createPantryItem', () => {
  it('calls the create_pantry_item RPC with the expected shape', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: BASE_ROW, error: null });

    const result = await createPantryItem(
      {
        ingredientId: 'ing-manual-1',
        imageUri: 'https://example.com/photo.jpg',
        displayName: 'Milk',
        category: 'dairy',
        quantity: 1,
        unit: 'item',
        storageLocation: 'fridge',
        purchaseDate: '2026-08-10',
      },
      'UTC',
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      'create_pantry_item',
      expect.objectContaining({
        p_ingredient_id: 'ing-manual-1',
        p_display_name: 'Milk',
        p_category: 'dairy',
        p_quantity: 1,
        p_unit: 'item',
        p_storage_location: 'fridge',
        p_user_provided_date: null,
      }),
    );
    expect(result.id).toBe('item-1');
  });

  it('defaults p_source_scan_detection_id to null for a manual add', async () => {
    const mock = supabase.rpc as jest.Mock;
    mock.mockResolvedValue({ data: BASE_ROW, error: null });
    await createPantryItem(
      { ingredientId: 'i', imageUri: '', displayName: 'Milk', category: 'dairy', quantity: 1, unit: 'item' },
      'UTC',
    );
    expect(mock.mock.calls.at(-1)?.[1]).toMatchObject({ p_source: 'manual', p_source_scan_detection_id: null });
  });

  it('forwards sourceScanDetectionId as the pantry idempotency key for a scan-confirmed item', async () => {
    const mock = supabase.rpc as jest.Mock;
    mock.mockResolvedValue({ data: BASE_ROW, error: null });
    await createPantryItem(
      {
        ingredientId: 'i',
        imageUri: '',
        displayName: 'Milk',
        category: 'dairy',
        quantity: 1,
        unit: 'item',
        source: 'scan',
        sourceScanDetectionId: 'det-123',
      },
      'UTC',
    );
    expect(mock.mock.calls.at(-1)?.[1]).toMatchObject({
      p_source: 'scan',
      p_source_scan_detection_id: 'det-123',
    });
  });
});

describe('adjustPantryQuantity / depletePantryItem / restorePantryItem / confirmPantryItem', () => {
  it('adjustPantryQuantity calls the RPC with itemId, delta, and event type', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { ...BASE_ROW, quantity: 0, status: 'depleted' }, error: null });

    await adjustPantryQuantity('item-1', -1, 'consumed', 'used in recipe', 'UTC');

    expect(supabase.rpc).toHaveBeenCalledWith('adjust_pantry_quantity', {
      p_item_id: 'item-1',
      p_delta: -1,
      p_event_type: 'consumed',
      p_reason: 'used in recipe',
    });
  });

  it('depletePantryItem calls the RPC with the given event type', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: { ...BASE_ROW, quantity: 0, status: 'depleted' }, error: null });

    await depletePantryItem('item-1', 'discarded', undefined, 'UTC');

    expect(supabase.rpc).toHaveBeenCalledWith('deplete_pantry_item', {
      p_item_id: 'item-1',
      p_event_type: 'discarded',
      p_reason: null,
    });
  });

  it('restorePantryItem calls the RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: BASE_ROW, error: null });

    await restorePantryItem('item-1', 'still have it', 'UTC');

    expect(supabase.rpc).toHaveBeenCalledWith('restore_pantry_item', { p_item_id: 'item-1', p_reason: 'still have it' });
  });

  it('confirmPantryItem calls the RPC with only the item id', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: BASE_ROW, error: null });

    await confirmPantryItem('item-1', 'UTC');

    expect(supabase.rpc).toHaveBeenCalledWith('confirm_pantry_item', { p_item_id: 'item-1' });
  });

  it('propagates an RPC error (e.g. the below-zero rejection) instead of swallowing it', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('quantity cannot go below zero') });

    await expect(adjustPantryQuantity('item-1', -100, 'consumed', undefined, 'UTC')).rejects.toThrow(
      'quantity cannot go below zero',
    );
  });
});

describe('transferGroceryItemToPantry', () => {
  it('calls transfer_grocery_item_to_pantry with the reviewed values and the grocery id, and maps the row', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ...BASE_ROW, id: 'lot-1', scan_source: 'grocery' },
      error: null,
    });

    const result = await transferGroceryItemToPantry(
      {
        groceryItemId: 'gi-1',
        ingredientId: 'ing-chicken-breast',
        imageUri: 'https://example.com/c.jpg',
        displayName: 'Chicken Breast',
        category: 'protein',
        quantity: 1,
        unit: 'lb',
        purchaseDate: '2026-09-06',
        estimatedExpirationDate: '2026-09-10',
        expirationConfidence: 'medium',
      },
      'UTC',
    );

    expect(supabase.rpc).toHaveBeenCalledWith('transfer_grocery_item_to_pantry', {
      p_grocery_item_id: 'gi-1',
      p_ingredient_id: 'ing-chicken-breast',
      p_display_name: 'Chicken Breast',
      p_image_uri: 'https://example.com/c.jpg',
      p_category: 'protein',
      p_quantity: 1,
      p_unit: 'lb',
      p_storage_location: null,
      p_notes: null,
      p_purchase_date: '2026-09-06',
      p_user_provided_date: null,
      p_user_provided_date_type: null,
      p_estimated_expiration_date: '2026-09-10',
      p_expiration_confidence: 'medium',
    });
    expect(result.id).toBe('lot-1');
    expect(result.source).toBe('grocery');
  });

  it('propagates a Supabase / RPC error (e.g. "grocery item is not marked as acquired")', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: new Error('grocery item is not marked as acquired'),
    });
    await expect(
      transferGroceryItemToPantry(
        { groceryItemId: 'gi-1', ingredientId: 'i', imageUri: '', displayName: 'X', category: 'other', quantity: 1, unit: 'item' },
        'UTC',
      ),
    ).rejects.toThrow('not marked as acquired');
  });
});

describe('updatePantryItemMetadata', () => {
  it('only sends columns that were actually passed', async () => {
    const chain = mockChain({ data: { ...BASE_ROW, display_name: 'Whole Milk' }, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await updatePantryItemMetadata('item-1', { displayName: 'Whole Milk' }, 'UTC');

    expect(chain.update).toHaveBeenCalledWith({ display_name: 'Whole Milk' });
  });

  it('never includes quantity or status in the update payload, even if a caller tried to sneak them in', async () => {
    const chain = mockChain({ data: BASE_ROW, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    // @ts-expect-error - deliberately testing that the params type doesn't allow this
    await updatePantryItemMetadata('item-1', { quantity: 999, status: 'depleted' }, 'UTC');

    const payload = (chain.update as jest.Mock).mock.calls[0][0];
    expect(payload).not.toHaveProperty('quantity');
    expect(payload).not.toHaveProperty('status');
  });
});
