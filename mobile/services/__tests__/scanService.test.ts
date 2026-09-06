import { supabase } from '@/lib/supabase/client';
import { FreshnessLabel, Scan, ScanDetection, ScanSectionResult } from '@/types';
import { scanService, ScanConfirmError } from '../scanService';
import { db } from '../mockDb';
import { pantryService } from '../pantryService';
import { recipeService } from '../recipeService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('../pantryService', () => ({
  pantryService: { createScanItem: jest.fn() },
}));

jest.mock('../recipeService', () => ({
  recipeService: { countReadyToCookRecipes: jest.fn() },
}));

const createScanItem = pantryService.createScanItem as jest.Mock;
const countReadyToCookRecipes = recipeService.countReadyToCookRecipes as jest.Mock;
const getUser = supabase.auth.getUser as jest.Mock;

function makeDetection(overrides: Partial<ScanDetection> = {}): ScanDetection {
  return {
    id: `det-${Math.random().toString(36).slice(2)}`,
    ingredientId: 'ing-spinach',
    name: 'Spinach',
    imageUri: 'https://example.com/spinach.jpg',
    category: 'produce',
    boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    detectionConfidence: 0.9,
    quantity: { value: 1, unit: 'bag', confidence: 0.8, isLowConfidence: false },
    freshness: { score: 70, confidence: 0.8, label: 'fresh' as FreshnessLabel },
    ...overrides,
  };
}

function makeScan(detections: ScanDetection[], extraSections: ScanSectionResult[] = []): Scan {
  return {
    id: 'scan-draft-1',
    mode: 'guided',
    status: 'reviewing',
    createdAt: '2026-09-05T00:00:00.000Z',
    sections: [{ section: 'fridge', imageUri: 'https://example.com/fridge.jpg', detections, skipped: false }, ...extraSections],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  countReadyToCookRecipes.mockResolvedValue(3);
  createScanItem.mockImplementation(async (params) => ({ id: `item-${params.ingredientId}`, ...params }));
  db.scans = [];
  db.pantry = [];
});

describe('confirmScan - successful confirmation', () => {
  it('persists every confirmed detection through create_pantry_item with scan_source and no fabricated expiration', async () => {
    const scan = makeScan([
      makeDetection({ ingredientId: 'ing-spinach', name: 'Spinach', category: 'produce' }),
      makeDetection({ ingredientId: 'ing-milk', name: 'Milk', category: 'dairy', quantity: { value: 1, unit: 'container', confidence: 0.9, isLowConfidence: false } }),
    ]);

    const { summary } = await scanService.confirmScan(scan);

    expect(createScanItem).toHaveBeenCalledTimes(2);
    // Routes through the SHARED pantry creation path (pantryService.createScanItem),
    // not a scan-local insert. Detection shape in, no fabricated date fields.
    expect(createScanItem).toHaveBeenNthCalledWith(
      1,
      { ingredientId: 'ing-spinach', name: 'Spinach', imageUri: 'https://example.com/spinach.jpg', category: 'produce', quantity: 1, unit: 'bag' },
      'UTC',
    );
    expect(createScanItem.mock.calls[0][0]).not.toHaveProperty('estimatedExpirationDate');
    expect(createScanItem.mock.calls[0][0]).not.toHaveProperty('purchaseDate');

    expect(summary.ingredientsAdded).toBe(2);
    expect(summary.mealsPossibleEstimate).toBe(3);
  });

  it('ignores removed detections and derives needsAttention / quantityCorrected counts from the review session', async () => {
    const scan = makeScan([
      makeDetection({ ingredientId: 'ing-a', freshness: { score: 20, confidence: 0.8, label: 'prioritize' } }),
      makeDetection({ ingredientId: 'ing-b', freshness: { score: 40, confidence: 0.8, label: 'use_soon' }, isQuantityEdited: true }),
      makeDetection({ ingredientId: 'ing-c', isRemoved: true }),
    ]);

    const { summary } = await scanService.confirmScan(scan);

    expect(createScanItem).toHaveBeenCalledTimes(2);
    expect(createScanItem.mock.calls.map((c) => c[0].ingredientId)).toEqual(['ing-a', 'ing-b']);
    expect(summary.ingredientsAdded).toBe(2);
    expect(summary.needsAttentionCount).toBe(2);
    expect(summary.quantityCorrectedCount).toBe(1);
  });

  it('records the confirmed scan in history only after every row persisted', async () => {
    const scan = makeScan([makeDetection()]);

    await scanService.confirmScan(scan);

    expect(db.scans).toHaveLength(1);
    expect(db.scans[0].status).toBe('confirmed');
  });

  it('passes an explicit timezone through to the repository when given', async () => {
    await scanService.confirmScan(makeScan([makeDetection()]), 'America/New_York');
    expect(createScanItem).toHaveBeenCalledWith(expect.any(Object), 'America/New_York');
  });
});

describe('confirmScan - invalid quantities / units', () => {
  it('throws ScanConfirmError (never swallows) when the RPC rejects an out-of-range quantity', async () => {
    createScanItem.mockRejectedValueOnce(new Error('quantity cannot be negative'));
    const scan = makeScan([makeDetection({ quantity: { value: -2, unit: 'bag', confidence: 0.5, isLowConfidence: true } })]);

    await expect(scanService.confirmScan(scan)).rejects.toBeInstanceOf(ScanConfirmError);
  });

  it('reports the RPC rejection for an unsupported unit and adds nothing to history', async () => {
    createScanItem.mockRejectedValueOnce(new Error('new row for relation "pantry_items" violates check constraint "pantry_items_unit_check"'));
    const scan = makeScan([makeDetection({ quantity: { value: 1, unit: 'scoop' as never, confidence: 0.5, isLowConfidence: true } })]);

    await expect(scanService.confirmScan(scan)).rejects.toMatchObject({ addedCount: 0, failedCount: 1 });
    expect(db.scans).toHaveLength(0);
  });
});

describe('confirmScan - partial failures', () => {
  it('throws with accurate added/failed counts and does NOT roll back the rows that already persisted', async () => {
    createScanItem
      .mockImplementationOnce(async (p) => ({ id: 'item-1', ...p }))
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
      .mockImplementationOnce(async (p) => ({ id: 'item-3', ...p }));

    const scan = makeScan([
      makeDetection({ ingredientId: 'ing-1' }),
      makeDetection({ ingredientId: 'ing-2' }),
      makeDetection({ ingredientId: 'ing-3' }),
    ]);

    const error = await scanService.confirmScan(scan).catch((e) => e);

    expect(error).toBeInstanceOf(ScanConfirmError);
    expect(error.addedCount).toBe(2);
    expect(error.failedCount).toBe(1);
    expect(error.failures).toHaveLength(1);
    // All three were attempted - the two successes are real writes, not undone.
    expect(createScanItem).toHaveBeenCalledTimes(3);
    // A partial failure is not "history".
    expect(db.scans).toHaveLength(0);
  });
});

describe('confirmScan - auth isolation / no silent fallback', () => {
  it('throws before touching the pantry when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const scan = makeScan([makeDetection()]);

    await expect(scanService.confirmScan(scan)).rejects.toThrow('Not signed in');
    expect(createScanItem).not.toHaveBeenCalled();
  });

  it('never writes to the in-memory mock pantry, on success or on failure', async () => {
    const pantryLenBefore = db.pantry.length;

    await scanService.confirmScan(makeScan([makeDetection({ ingredientId: 'ok' })]));
    expect(db.pantry.length).toBe(pantryLenBefore);

    createScanItem.mockRejectedValueOnce(new Error('boom'));
    await scanService.confirmScan(makeScan([makeDetection({ ingredientId: 'bad' })])).catch(() => undefined);
    expect(db.pantry.length).toBe(pantryLenBefore);
  });
});

describe('confirmScan - duplicate / retry behavior', () => {
  it('is not idempotent: confirming the same scan twice issues the create RPC again for every detection', async () => {
    const scan = makeScan([makeDetection({ ingredientId: 'ing-1' }), makeDetection({ ingredientId: 'ing-2' })]);

    await scanService.confirmScan(scan);
    await scanService.confirmScan(scan);

    expect(createScanItem).toHaveBeenCalledTimes(4);
    expect(db.scans).toHaveLength(2);
  });

  it('after a partial failure, a retry re-attempts all detections (including the ones that already succeeded)', async () => {
    const scan = makeScan([makeDetection({ ingredientId: 'ing-1' }), makeDetection({ ingredientId: 'ing-2' })]);

    createScanItem
      .mockImplementationOnce(async (p) => ({ id: 'item-1', ...p }))
      .mockRejectedValueOnce(new Error('transient network error'));

    await expect(scanService.confirmScan(scan)).rejects.toBeInstanceOf(ScanConfirmError);
    expect(createScanItem).toHaveBeenCalledTimes(2);

    // Retry: both go through again - no client-side dedupe of the already-added row.
    createScanItem.mockImplementation(async (p) => ({ id: `item-${p.ingredientId}`, ...p }));
    const { summary } = await scanService.confirmScan(scan);

    expect(createScanItem).toHaveBeenCalledTimes(4);
    expect(createScanItem.mock.calls.slice(2).map((c) => c[0].ingredientId)).toEqual(['ing-1', 'ing-2']);
    expect(summary.ingredientsAdded).toBe(2);
  });
});
