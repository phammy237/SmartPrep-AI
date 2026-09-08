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
  transferGroceryItemToPantry: jest.fn(),
  updatePantryItemMetadata: jest.fn(),
  adjustPantryQuantity: jest.fn(),
  depletePantryItem: jest.fn(),
  restorePantryItem: jest.fn(),
  confirmPantryItem: jest.fn(),
  linkReceiptScanItem: jest.fn(),
  finalizeReceiptReview: jest.fn(),
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
  (repositories.transferGroceryItemToPantry as jest.Mock).mockImplementation(async (params) => ({ ...CURRENT_ITEM, ...params, source: 'grocery' }));
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

  it('createScanItem forwards the detection id as the pantry idempotency key', async () => {
    await pantryService.createScanItem(
      { ingredientId: 'ing-spinach', name: 'Spinach', imageUri: 'x', category: 'produce', quantity: 1, unit: 'bag', sourceScanDetectionId: 'det-777' },
      'UTC',
    );
    const [params] = (repositories.createPantryItem as jest.Mock).mock.calls[0];
    expect(params.sourceScanDetectionId).toBe('det-777');
  });

  it('createScanItem passes no idempotency key when the caller omits one', async () => {
    await pantryService.createScanItem(
      { ingredientId: 'ing-spinach', name: 'Spinach', imageUri: 'x', category: 'produce', quantity: 1, unit: 'bag' },
      'UTC',
    );
    const [params] = (repositories.createPantryItem as jest.Mock).mock.calls[0];
    expect(params.sourceScanDetectionId).toBeUndefined();
  });

  it('createGroceryTransferItem routes through the SAME identity + expiration path, tags the grocery id', async () => {
    await pantryService.createGroceryTransferItem(
      {
        groceryItemId: 'gi-1',
        ingredientId: 'ing-chicken-breast',
        displayName: 'Chicken Breast',
        imageUri: 'x',
        category: 'protein',
        quantity: 1,
        unit: 'lb',
      },
      'UTC',
    );
    const [params, tz] = (repositories.transferGroceryItemToPantry as jest.Mock).mock.calls[0];
    expect(params).toMatchObject({
      groceryItemId: 'gi-1',
      ingredientId: 'ing-chicken-breast', // catalog id preserved
      // no dates given -> no fabricated expiration, confidence unknown
      expirationConfidence: 'unknown',
    });
    expect(params.estimatedExpirationDate).toBeUndefined();
    expect(tz).toBe('UTC');
    // creation never goes through the manual/scan create path
    expect(repositories.createPantryItem).not.toHaveBeenCalled();
  });

  it('createGroceryTransferItem resolves identity by name when the line had no catalog id', async () => {
    await pantryService.createGroceryTransferItem(
      { groceryItemId: 'gi-2', displayName: 'Chicken Breast', imageUri: 'x', category: 'protein', quantity: 2, unit: 'lb' },
      'UTC',
    );
    const [params] = (repositories.transferGroceryItemToPantry as jest.Mock).mock.calls[0];
    expect(params.ingredientId).toBe('ing-chicken-breast');
  });

  it('createGroceryTransferItem keeps a synthetic id when nothing resolves, and never fabricates nutrition/USDA', async () => {
    await pantryService.createGroceryTransferItem(
      { groceryItemId: 'gi-3', displayName: 'Homemade Chili Crisp', imageUri: '', category: 'other', quantity: 1, unit: 'container' },
      'UTC',
    );
    const [params] = (repositories.transferGroceryItemToPantry as jest.Mock).mock.calls[0];
    expect(params.ingredientId).toMatch(/^ing-(grocery|manual)/);
    expect(params).not.toHaveProperty('fdcId');
    expect(resolveQuantityNutrition).not.toHaveBeenCalled();
  });

  it('createGroceryTransferItem passes a purchase date through to the category expiration heuristic (medium)', async () => {
    await pantryService.createGroceryTransferItem(
      {
        groceryItemId: 'gi-4',
        ingredientId: 'ing-chicken-breast',
        displayName: 'Chicken Breast',
        imageUri: 'x',
        category: 'protein',
        quantity: 1,
        unit: 'lb',
        purchaseDate: '2026-09-06',
      },
      'UTC',
    );
    const [params] = (repositories.transferGroceryItemToPantry as jest.Mock).mock.calls[0];
    expect(params.purchaseDate).toBe('2026-09-06');
    expect(params.expirationConfidence).toBe('medium');
    expect(params.estimatedExpirationDate).toBe('2026-09-10'); // protein shelf life = 4 days
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

describe('createBarcodeItem', () => {
  const BASE = {
    barcode: '036000291452',
    displayName: 'Chobani Nonfat Greek Yogurt, Vanilla',
    brand: 'Chobani',
    category: 'dairy' as const,
    quantity: 150,
    unit: 'g' as const,
    sourceProductId: '036000291452',
  };

  it('goes through create_pantry_item with source "barcode" and persists barcode + brand as provenance', async () => {
    await pantryService.createBarcodeItem(BASE, 'UTC');
    expect(repositories.createPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'barcode',
        barcode: '036000291452',
        brand: 'Chobani',
        displayName: 'Chobani Nonfat Greek Yogurt, Vanilla',
        category: 'dairy',
        quantity: 150,
        unit: 'g',
      }),
      'UTC',
    );
  });

  it('does NOT force a branded product onto a generic canonical ingredient (synthetic ing-barcode id, product name kept)', async () => {
    await pantryService.createBarcodeItem(BASE, 'UTC');
    const args = (repositories.createPantryItem as jest.Mock).mock.calls[0][0];
    expect(args.ingredientId).toMatch(/^ing-barcode/);
    expect(args.displayName).toBe('Chobani Nonfat Greek Yogurt, Vanilla');
  });

  it('maps to a canonical ingredient only when the exact resolver hits', async () => {
    await pantryService.createBarcodeItem({ ...BASE, displayName: 'Chicken Breast', category: 'protein', unit: 'lb' }, 'UTC');
    const args = (repositories.createPantryItem as jest.Mock).mock.calls[0][0];
    expect(args.ingredientId).toBe('ing-chicken-breast');
  });

  it('fabricates no expiration date when the user supplied none', async () => {
    await pantryService.createBarcodeItem(BASE, 'UTC');
    expect(repositories.createPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ expirationConfidence: 'unknown', estimatedExpirationDate: undefined }),
      'UTC',
    );
  });

  it('honours a printed best-by date (confidence high)', async () => {
    await pantryService.createBarcodeItem(
      { ...BASE, userProvidedDate: '2026-12-31', userProvidedDateType: 'best_by' },
      'UTC',
    );
    expect(repositories.createPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedExpirationDate: '2026-12-31', expirationConfidence: 'high' }),
      'UTC',
    );
  });

  it('uses the provider image only when it is an https URL', async () => {
    await pantryService.createBarcodeItem({ ...BASE, imageUrl: 'https://images.openfoodfacts.org/x.jpg' }, 'UTC');
    const httpsArgs = (repositories.createPantryItem as jest.Mock).mock.calls[0][0];
    expect(httpsArgs.imageUri).toBe('https://images.openfoodfacts.org/x.jpg');
  });

  it('the same barcode can be added again later (no idempotency key sent)', async () => {
    await pantryService.createBarcodeItem(BASE, 'UTC');
    await pantryService.createBarcodeItem(BASE, 'UTC');
    expect(repositories.createPantryItem).toHaveBeenCalledTimes(2);
    for (const call of (repositories.createPantryItem as jest.Mock).mock.calls) {
      expect(call[0]).not.toHaveProperty('sourceScanDetectionId');
    }
  });

  it('persists fdc_id only when review resolved an exact USDA match', async () => {
    await pantryService.createBarcodeItem({ ...BASE, fdcId: '2666511' }, 'UTC');
    expect(repositories.createPantryItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ fdcId: '2666511', source: 'barcode' }),
      'UTC',
    );

    (repositories.createPantryItem as jest.Mock).mockClear();
    await pantryService.createBarcodeItem(BASE, 'UTC');
    expect((repositories.createPantryItem as jest.Mock).mock.calls[0][0].fdcId).toBeUndefined();
  });
});

describe('createReceiptItem / createReceiptItemsToPantry', () => {
  const SCAN_ID = '11111111-1111-1111-1111-111111111111';
  const item = (over: Partial<Record<string, unknown>> = {}) => ({
    receiptScanId: SCAN_ID,
    candidateId: 'L1',
    rawText: 'BNLS CHKN BRST',
    displayName: 'Chicken Breast',
    category: 'protein' as const,
    quantity: 2,
    unit: 'lb' as const,
    purchaseDate: '2026-09-05',
    ...over,
  });

  beforeEach(() => {
    (repositories.linkReceiptScanItem as jest.Mock).mockResolvedValue(undefined);
    (repositories.finalizeReceiptReview as jest.Mock).mockResolvedValue({ id: SCAN_ID, status: 'confirmed', itemCount: 1 });
  });

  it('goes through create_pantry_item with source "receipt" + receipt provenance/idempotency ids, then links the candidate', async () => {
    await pantryService.createReceiptItem(item(), 'UTC');
    expect(repositories.createPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'receipt',
        sourceReceiptCandidateId: 'L1',
        sourceReceiptId: SCAN_ID,
        displayName: 'Chicken Breast',
        category: 'protein',
        quantity: 2,
        unit: 'lb',
      }),
      'UTC',
    );
    expect(repositories.linkReceiptScanItem).toHaveBeenCalledWith(SCAN_ID, 'L1', expect.any(String));
  });

  it('an EXACT canonical name resolves; an abbreviation gets a synthetic ing-receipt id (raw text never becomes identity)', async () => {
    await pantryService.createReceiptItem(item({ displayName: 'chicken breast' }), 'UTC');
    expect((repositories.createPantryItem as jest.Mock).mock.calls[0][0].ingredientId).toBe('ing-chicken-breast');

    (repositories.createPantryItem as jest.Mock).mockClear();
    await pantryService.createReceiptItem(item({ displayName: 'ORG BAN', candidateId: 'L2' }), 'UTC');
    const args = (repositories.createPantryItem as jest.Mock).mock.calls[0][0];
    expect(args.ingredientId).toMatch(/^ing-receipt/);
    expect(args.displayName).toBe('ORG BAN');
  });

  it('never fabricates an expiration date from a receipt (no printed date supplied)', async () => {
    await pantryService.createReceiptItem(item({ purchaseDate: undefined }), 'UTC');
    expect(repositories.createPantryItem).toHaveBeenCalledWith(
      expect.objectContaining({ expirationConfidence: 'unknown', estimatedExpirationDate: undefined }),
      'UTC',
    );
  });

  it('batch: independent per candidate - one failure does not block the rest, and the session is finalized', async () => {
    (repositories.createPantryItem as jest.Mock).mockImplementation(async (params) => {
      if (params.sourceReceiptCandidateId === 'L2') throw new Error('bad line');
      return { ...CURRENT_ITEM, id: `item-${params.sourceReceiptCandidateId}`, ...params };
    });

    const res = await pantryService.createReceiptItemsToPantry(
      SCAN_ID,
      [item({ candidateId: 'L1' }), item({ candidateId: 'L2' }), item({ candidateId: 'L3' })],
      ['L9'],
      'UTC',
    );

    expect(res.created.map((i) => i.id)).toEqual(['item-L1', 'item-L3']);
    expect(res.failed).toEqual([{ candidateId: 'L2', reason: 'bad line' }]);
    expect(repositories.linkReceiptScanItem).toHaveBeenCalledTimes(2); // only the two that succeeded
    expect(repositories.finalizeReceiptReview).toHaveBeenCalledWith(SCAN_ID, ['L9']);
  });

  it('retrying the batch reuses already-created lots (create_pantry_item is idempotent per candidate)', async () => {
    const store = new Map<string, unknown>();
    (repositories.createPantryItem as jest.Mock).mockImplementation(async (params) => {
      const key = params.sourceReceiptCandidateId;
      if (!store.has(key)) store.set(key, { ...CURRENT_ITEM, id: `item-${key}`, ...params });
      return store.get(key);
    });

    const items = [item({ candidateId: 'L1' }), item({ candidateId: 'L2' })];
    const first = await pantryService.createReceiptItemsToPantry(SCAN_ID, items, [], 'UTC');
    const second = await pantryService.createReceiptItemsToPantry(SCAN_ID, items, [], 'UTC');
    expect(first.created.map((i) => i.id)).toEqual(second.created.map((i) => i.id));
    expect(store.size).toBe(2); // no duplicates
  });

  it('the same receipt candidate id from a DIFFERENT receipt scan is a separate lot', async () => {
    (repositories.createPantryItem as jest.Mock).mockImplementation(async (params) => ({
      ...CURRENT_ITEM,
      id: `${params.sourceReceiptId}:${params.sourceReceiptCandidateId}`,
      ...params,
    }));
    const a = await pantryService.createReceiptItem(item({ candidateId: 'L1', receiptScanId: SCAN_ID }), 'UTC');
    const b = await pantryService.createReceiptItem(
      item({ candidateId: 'L1', receiptScanId: '22222222-2222-2222-2222-222222222222' }),
      'UTC',
    );
    expect(a.id).not.toBe(b.id);
  });
});

describe('resolveItemNutrition', () => {
  it('forwards the item barcode so the resolver can prefer product-specific nutrition', async () => {
    (nutritionService.resolveQuantityNutrition as jest.Mock).mockResolvedValue({ status: 'unresolved' });
    await pantryService.resolveItemNutrition({ ingredientId: 'ing-barcode-x', quantity: 150, unit: 'g', barcode: '036000291452' });
    expect(nutritionService.resolveQuantityNutrition).toHaveBeenCalledWith({
      canonicalIngredientId: 'ing-barcode-x',
      quantity: 150,
      unit: 'g',
      barcode: '036000291452',
    });
  });

  it('passes undefined barcode for a non-barcode item (manual / scan / grocery)', async () => {
    (nutritionService.resolveQuantityNutrition as jest.Mock).mockResolvedValue({ status: 'unresolved' });
    await pantryService.resolveItemNutrition({ ingredientId: 'ing-milk', quantity: 1, unit: 'item' });
    expect(nutritionService.resolveQuantityNutrition).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalIngredientId: 'ing-milk', barcode: undefined }),
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
