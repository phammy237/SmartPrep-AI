import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { pantryService } from '../pantryService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/supabase/repositories', () => ({
  fetchPantryItems: jest.fn(),
  fetchPantryItem: jest.fn(),
  createPantryItem: jest.fn(),
  updatePantryItemMetadata: jest.fn(),
  adjustPantryQuantity: jest.fn(),
  depletePantryItem: jest.fn(),
  restorePantryItem: jest.fn(),
  confirmPantryItem: jest.fn(),
}));

const CURRENT_ITEM = {
  id: 'item-1',
  ingredientId: 'ing-1',
  name: 'Milk',
  imageUri: '',
  category: 'dairy' as const,
  quantity: 1,
  unit: 'item' as const,
  freshness: { score: 80, confidence: 0.9, label: 'fresh' as const },
  addedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  source: 'manual' as const,
  purchaseDate: '2026-08-01',
};

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('updateItemMetadata', () => {
  it('does not touch quantity/status and does not call any of the mutating RPC repository functions for a plain rename', async () => {
    (repositories.updatePantryItemMetadata as jest.Mock).mockResolvedValue(CURRENT_ITEM);

    await pantryService.updateItemMetadata('item-1', { displayName: 'Whole Milk' }, 'UTC');

    expect(repositories.updatePantryItemMetadata).toHaveBeenCalledWith('item-1', { displayName: 'Whole Milk' }, 'UTC');
    expect(repositories.adjustPantryQuantity).not.toHaveBeenCalled();
    expect(repositories.depletePantryItem).not.toHaveBeenCalled();
    expect(repositories.restorePantryItem).not.toHaveBeenCalled();
    expect(repositories.fetchPantryItem).not.toHaveBeenCalled();
  });

  it('recomputes the expiration estimate when a date field changes, by reading the current item first', async () => {
    (repositories.fetchPantryItem as jest.Mock).mockResolvedValue(CURRENT_ITEM);
    (repositories.updatePantryItemMetadata as jest.Mock).mockResolvedValue(CURRENT_ITEM);

    await pantryService.updateItemMetadata('item-1', { userProvidedDate: '2026-08-20', userProvidedDateType: 'best_by' }, 'UTC');

    expect(repositories.fetchPantryItem).toHaveBeenCalledWith('item-1', 'UTC');
    expect(repositories.updatePantryItemMetadata).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({
        userProvidedDate: '2026-08-20',
        estimatedExpirationDate: '2026-08-20',
        expirationConfidence: 'high',
      }),
      'UTC',
    );
  });

  it('skips the recompute entirely for edits that touch neither a date nor category', async () => {
    (repositories.updatePantryItemMetadata as jest.Mock).mockResolvedValue(CURRENT_ITEM);

    await pantryService.updateItemMetadata('item-1', { notes: 'opened yesterday' }, 'UTC');

    expect(repositories.fetchPantryItem).not.toHaveBeenCalled();
  });
});

describe('adjustQuantity', () => {
  it('calls the adjust RPC with a negative delta for a single deduction', async () => {
    (repositories.adjustPantryQuantity as jest.Mock).mockResolvedValue({ ...CURRENT_ITEM, quantity: 0 });

    await pantryService.adjustQuantity('item-1', -1, 'consumed', undefined, 'UTC');

    expect(repositories.adjustPantryQuantity).toHaveBeenCalledWith('item-1', -1, 'consumed', undefined, 'UTC');
  });

  it('does not deduplicate repeated calls - calling twice applies twice (no client-side idempotency in Phase 2)', async () => {
    (repositories.adjustPantryQuantity as jest.Mock).mockResolvedValue({ ...CURRENT_ITEM, quantity: 0 });

    await pantryService.adjustQuantity('item-1', -1, 'consumed', undefined, 'UTC');
    await pantryService.adjustQuantity('item-1', -1, 'consumed', undefined, 'UTC');

    expect(repositories.adjustPantryQuantity).toHaveBeenCalledTimes(2);
  });
});

describe('addManualPantryItem', () => {
  it('never fabricates estimatedGrams - it is simply not passed through when the caller did not supply one', async () => {
    (repositories.createPantryItem as jest.Mock).mockResolvedValue(CURRENT_ITEM);

    await pantryService.addManualPantryItem(
      { displayName: 'Milk', category: 'dairy', quantity: 1, unit: 'item' },
      'UTC',
    );

    const callArgs = (repositories.createPantryItem as jest.Mock).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('estimatedGrams');
  });

  it('computes expirationConfidence "unknown" and no date when neither purchase nor package date is given', async () => {
    (repositories.createPantryItem as jest.Mock).mockResolvedValue(CURRENT_ITEM);

    await pantryService.addManualPantryItem({ displayName: 'Salt', category: 'pantry', quantity: 1, unit: 'item' }, 'UTC');

    expect(repositories.createPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ expirationConfidence: 'unknown', estimatedExpirationDate: undefined }),
      'UTC',
    );
  });
});

describe('requireUserId (via getPantry)', () => {
  it('throws a clear error instead of calling the repository when there is no session', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });

    await expect(pantryService.getPantry('UTC')).rejects.toThrow('Not signed in');
    expect(repositories.fetchPantryItems).not.toHaveBeenCalled();
  });
});
