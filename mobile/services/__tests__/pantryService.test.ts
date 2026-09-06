import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { pantryService } from '../pantryService';
import { nutritionService } from '../nutritionService';

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

jest.mock('../nutritionService', () => ({
  nutritionService: { resolveQuantityNutrition: jest.fn() },
}));

const resolveQuantityNutrition = nutritionService.resolveQuantityNutrition as jest.Mock;

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
  (repositories.createPantryItem as jest.Mock).mockImplementation(async (params) => ({ ...CURRENT_ITEM, ...params }));
});

describe('shared identity resolution on create', () => {
  it('addManualPantryItem resolves an exact catalog match and stores the canonical id + photo', async () => {
    await pantryService.addManualPantryItem(
      { displayName: 'Chicken Breast', category: 'protein', quantity: 1, unit: 'lb' },
      'UTC',
    );
    const [params] = (repositories.createPantryItem as jest.Mock).mock.calls[0];
    expect(params.ingredientId).toBe('ing-chicken-breast');
    expect(params.imageUri).toContain('loremflickr'); // catalog photo, not a synthetic one
    // the user's explicit category pick is respected, not overridden by the catalog
    expect(params.category).toBe('protein');
    expect(params.source).toBe('manual');
  });

  it('addManualPantryItem keeps a synthetic id when nothing resolves', async () => {
    await pantryService.addManualPantryItem(
      { displayName: 'Some Obscure Homemade Thing', category: 'other', quantity: 1, unit: 'item' },
      'UTC',
    );
    const [params] = (repositories.createPantryItem as jest.Mock).mock.calls[0];
    expect(params.ingredientId).toMatch(/^ing-manual/);
    expect(params.category).toBe('other');
  });

  it('createScanItem routes through the SAME identity path (catalog id preserved, scan source, no fabricated date)', async () => {
    await pantryService.createScanItem(
      { ingredientId: 'ing-spinach', name: 'Spinach', imageUri: 'x', category: 'produce', quantity: 1, unit: 'bag' },
      'UTC',
    );
    const [params, tz] = (repositories.createPantryItem as jest.Mock).mock.calls[0];
    expect(params).toMatchObject({ ingredientId: 'ing-spinach', source: 'scan', expirationConfidence: 'unknown' });
    expect(params).not.toHaveProperty('estimatedExpirationDate');
    expect(tz).toBe('UTC');
  });

  it('createScanItem resolves by name when the hint id is not a catalog id', async () => {
    await pantryService.createScanItem(
      { ingredientId: 'det-xyz', name: 'Chicken Breast', imageUri: 'x', category: 'protein', quantity: 1, unit: 'lb' },
      'UTC',
    );
    const [params] = (repositories.createPantryItem as jest.Mock).mock.calls[0];
    expect(params.ingredientId).toBe('ing-chicken-breast');
  });
});

describe('resolveItemNutrition (read-time, secondary)', () => {
  it('delegates to nutritionService with the item identity/quantity/unit', async () => {
    resolveQuantityNutrition.mockResolvedValue({ status: 'unresolved', reason: 'no_nutrition_reference', grams: 100, snapshot: null, provenance: {} });
    await pantryService.resolveItemNutrition({ ingredientId: 'ing-chicken-breast', quantity: 200, unit: 'g' });
    expect(resolveQuantityNutrition).toHaveBeenCalledWith({ canonicalIngredientId: 'ing-chicken-breast', quantity: 200, unit: 'g' });
  });

  it('propagates an infrastructure failure (caller must know enrichment failed)', async () => {
    resolveQuantityNutrition.mockRejectedValue(new Error('Not signed in'));
    await expect(
      pantryService.resolveItemNutrition({ ingredientId: 'ing-x', quantity: 1, unit: 'g' }),
    ).rejects.toThrow('Not signed in');
  });
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
