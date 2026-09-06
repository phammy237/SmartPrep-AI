import { supabase } from '@/lib/supabase/client';
import * as repositories from '@/lib/supabase/repositories';
import { Scan, ScanDetection, ScanSectionResult } from '@/types';
import { ScanConfirmError, ScanInferenceError, ScanReviewIncompleteError, scanService } from '../scanService';
import { pantryService } from '../pantryService';
import { recipeService } from '../recipeService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/supabase/repositories', () => {
  const actual = jest.requireActual('@/lib/supabase/repositories');
  return {
    ...actual,
    detectScanIngredients: jest.fn(),
    beginScanConfirmation: jest.fn(),
    linkScanDetection: jest.fn(),
    finalizeScanConfirmation: jest.fn(),
    fetchConfirmedScans: jest.fn(),
    fetchScanDetail: jest.fn(),
  };
});

jest.mock('../pantryService', () => ({
  pantryService: { createScanItem: jest.fn() },
}));

jest.mock('../recipeService', () => ({
  recipeService: { countReadyToCookRecipes: jest.fn() },
}));

const detectScanIngredients = repositories.detectScanIngredients as jest.Mock;
const beginScanConfirmation = repositories.beginScanConfirmation as jest.Mock;
const linkScanDetection = repositories.linkScanDetection as jest.Mock;
const finalizeScanConfirmation = repositories.finalizeScanConfirmation as jest.Mock;
const fetchConfirmedScans = repositories.fetchConfirmedScans as jest.Mock;
const fetchScanDetail = repositories.fetchScanDetail as jest.Mock;
const createScanItem = pantryService.createScanItem as jest.Mock;
const countReadyToCookRecipes = recipeService.countReadyToCookRecipes as jest.Mock;
const getUser = supabase.auth.getUser as jest.Mock;

const IMAGE = { base64: 'x'.repeat(500), mimeType: 'image/jpeg' as const };

type V = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  confidence: number;
  quantityConfidence: number | null;
  needsReview: boolean;
  notes: string | null;
};
function vd(overrides: Partial<V> = {}): V {
  return {
    name: 'Apple',
    quantity: 3,
    unit: 'item',
    category: 'produce',
    confidence: 0.95,
    quantityConfidence: 0.9,
    needsReview: false,
    notes: null,
    ...overrides,
  };
}
function mockVision(detections: V[], warnings: string[] = []) {
  detectScanIngredients.mockResolvedValue({ detections, warnings });
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  countReadyToCookRecipes.mockResolvedValue(2);
  createScanItem.mockImplementation(async (p) => ({ id: `item-${p.name}`, ...p }));
  // Durable-confirmation repo defaults: fresh scan, nothing pre-linked.
  beginScanConfirmation.mockResolvedValue({ scanId: 'scan-uuid-1', status: 'confirming', detections: [] });
  linkScanDetection.mockResolvedValue(undefined);
  finalizeScanConfirmation.mockResolvedValue({ id: 'scan-uuid-1', status: 'confirmed', confirmedAt: '2026-09-05T00:00:00Z' });
});

describe('processCapture - real vision, structured mapping', () => {
  it('calls the vision repository with the image + mode + section and returns a section result', async () => {
    mockVision([vd({ name: 'Milk', quantity: 1, unit: 'L', category: 'dairy', confidence: 0.9, quantityConfidence: 0.85 })]);

    const result = await scanService.processCapture('guided', 'fridge', IMAGE, 'file:///preview.jpg');

    expect(detectScanIngredients).toHaveBeenCalledWith({ image: IMAGE, scanMode: 'guided', section: 'fridge' });
    expect(result.section).toBe('fridge');
    expect(result.imageUri).toBe('file:///preview.jpg');
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]).toMatchObject({ name: 'Milk', category: 'dairy', detectionConfidence: 0.9 });
    expect(result.detections[0].quantity).toMatchObject({ value: 1, unit: 'L' });
    // vision must not create pantry rows
    expect(createScanItem).not.toHaveBeenCalled();
  });

  it('resolves a canonical ingredient from an authored alias', async () => {
    mockVision([vd({ name: 'Boneless skinless chicken breast', quantity: 1, unit: 'lb', category: 'protein' })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].ingredientId).toBe('ing-chicken-breast');
    expect(detections[0].name).toBe('Chicken Breast');
  });

  it('keeps the human name + a synthetic id when nothing resolves', async () => {
    mockVision([vd({ name: 'Homemade Kimchi Jar', quantity: 1, unit: 'container', category: 'other' })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].name).toBe('Homemade Kimchi Jar');
    expect(detections[0].ingredientId).toMatch(/^ing-scan/);
    expect(detections[0].needsReview).toBeFalsy();
  });
});

describe('processCapture - unit normalization', () => {
  it('normalizes a spelled-out unit ("ounces" -> "oz")', async () => {
    mockVision([vd({ name: 'Ground Beef', quantity: 16, unit: 'ounces', category: 'protein' })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].quantity.unit).toBe('oz');
    expect(detections[0].reviewReasons ?? []).not.toContain('unit_needs_selection');
  });

  it('a unit outside the pantry schema is NOT guessed - it flags unit_needs_selection', async () => {
    mockVision([vd({ name: 'Flour', quantity: 2, unit: 'cups', category: 'pantry', quantityConfidence: 0.9 })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].reviewReasons).toContain('unit_needs_selection');
    expect(detections[0].needsReview).toBe(true);
    expect(detections[0].quantity.isLowConfidence).toBe(true);
    expect(detections[0].notes).toMatch(/cups/);
  });

  it('an unrecognizable unit also flags unit_needs_selection', async () => {
    mockVision([vd({ name: 'Rice', quantity: 1, unit: 'sack', category: 'pantry' })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].reviewReasons).toContain('unit_needs_selection');
  });
});

describe('processCapture - quantity uncertainty', () => {
  it('missing quantity -> quantity_missing, low confidence, value defaults to 1', async () => {
    mockVision([vd({ name: 'Spinach', quantity: null, unit: 'bag', quantityConfidence: null, category: 'produce' })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].reviewReasons).toContain('quantity_missing');
    expect(detections[0].quantity).toMatchObject({ value: 1, isLowConfidence: true });
    expect(detections[0].needsReview).toBe(true);
  });

  it('low quantityConfidence -> quantity_uncertain', async () => {
    mockVision([vd({ name: 'Strawberries', quantity: 1, unit: 'container', quantityConfidence: 0.3 })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].reviewReasons).toContain('quantity_uncertain');
  });

  it('a confidently-visible quantity is not flagged', async () => {
    mockVision([vd({ name: 'Eggs', quantity: 6, unit: 'item', quantityConfidence: 0.95 })]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections[0].needsReview).toBeFalsy();
    expect(detections[0].quantity.isLowConfidence).toBe(false);
  });
});

describe('processCapture - confidence gating', () => {
  it('high identity confidence -> not flagged; medium -> low_identity_confidence; low -> dropped as noise', async () => {
    mockVision([
      vd({ name: 'Carrot', confidence: 0.92 }),
      vd({ name: 'Maybe Onion', confidence: 0.5 }),
      vd({ name: 'Blurry Blob', confidence: 0.12 }),
    ]);
    const { detections } = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(detections.map((d) => d.name)).toEqual(['Carrot', 'Maybe Onion']);
    expect(detections[0].reviewReasons ?? []).not.toContain('low_identity_confidence');
    expect(detections[1].reviewReasons).toContain('low_identity_confidence');
    // low_identity_confidence alone does NOT block confirm
    expect(scanService.getBlockingReviewNames({ sections: [{ section: 'quick', imageUri: 'p', detections, skipped: false }] } as Scan)).toEqual([]);
  });

  it('empty detections -> an empty section result (no error, ready for manual entry)', async () => {
    mockVision([], ['Image too dark to identify anything.']);
    const result = await scanService.processCapture('quick', 'quick', IMAGE, 'p');
    expect(result.detections).toEqual([]);
    expect(result.skipped).toBe(false);
  });
});

describe('processCapture - failure never falls back to canned detections', () => {
  it('auth failure rejects before invoking vision', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(scanService.processCapture('quick', 'quick', IMAGE, 'p')).rejects.toThrow('Not signed in');
    expect(detectScanIngredients).not.toHaveBeenCalled();
  });

  it('a ScanInferenceError from the repository bubbles up unchanged', async () => {
    detectScanIngredients.mockRejectedValue(new ScanInferenceError('rate_limited'));
    const err = await scanService.processCapture('quick', 'quick', IMAGE, 'p').catch((e) => e);
    expect(err).toBeInstanceOf(ScanInferenceError);
    expect(err.code).toBe('rate_limited');
  });

  it('a malformed/model failure rejects - no ScanDetection[] is ever returned on error', async () => {
    detectScanIngredients.mockRejectedValue(new ScanInferenceError('malformed_upstream'));
    await expect(scanService.processCapture('quick', 'quick', IMAGE, 'p')).rejects.toBeInstanceOf(ScanInferenceError);
  });
});

describe('confirmScan - review gating', () => {
  function scanWith(detections: ScanDetection[]): Scan {
    const section: ScanSectionResult = { section: 'quick', imageUri: 'p', detections, skipped: false };
    return { id: 's1', mode: 'quick', status: 'reviewing', createdAt: 't', sections: [section] };
  }
  function det(overrides: Partial<ScanDetection> = {}): ScanDetection {
    return {
      id: `d-${Math.random()}`,
      ingredientId: 'ing-eggs',
      name: 'Eggs',
      imageUri: '',
      category: 'protein',
      boundingBox: { x: 0, y: 0, width: 0.2, height: 0.2 },
      detectionConfidence: 0.9,
      quantity: { value: 2, unit: 'item', confidence: 0.9, isLowConfidence: false },
      freshness: { score: 50, confidence: 0, label: 'cant_tell' },
      ...overrides,
    };
  }

  it('blocks confirmation while a detection still needs a quantity', async () => {
    const scan = scanWith([det({ name: 'Spinach', needsReview: true, reviewReasons: ['quantity_missing'], quantity: { value: 1, unit: 'bag', confidence: 0, isLowConfidence: true } })]);
    expect(scanService.getBlockingReviewNames(scan)).toEqual(['Spinach']);
    await expect(scanService.confirmScan(scan)).rejects.toBeInstanceOf(ScanReviewIncompleteError);
    expect(createScanItem).not.toHaveBeenCalled();
    // Nothing durable is written when review is incomplete.
    expect(beginScanConfirmation).not.toHaveBeenCalled();
  });

  it('unblocks once the quantity has been edited', async () => {
    const scan = scanWith([
      det({ name: 'Spinach', needsReview: true, reviewReasons: ['quantity_missing'], isQuantityEdited: true, quantity: { value: 2, unit: 'bag', confidence: 0, isLowConfidence: true } }),
    ]);
    expect(scanService.getBlockingReviewNames(scan)).toEqual([]);
    const { summary } = await scanService.confirmScan(scan);
    expect(summary.ingredientsAdded).toBe(1);
    expect(createScanItem).toHaveBeenCalledTimes(1);
  });

  it('blocks while a unit still needs selection; unblocks when a persistable unit is chosen', async () => {
    const blocked = scanWith([
      det({ name: 'Flour', needsReview: true, reviewReasons: ['unit_needs_selection'], quantity: { value: 2, unit: 'item', confidence: 0.9, isLowConfidence: true } }),
    ]);
    // 'item' IS persistable, so treated as chosen -> not blocked; use a non-persistable to simulate "unchosen"
    expect(scanService.getBlockingReviewNames(blocked)).toEqual([]);

    const stillBlocked = scanWith([
      det({ name: 'Flour', needsReview: true, reviewReasons: ['unit_needs_selection'], quantity: { value: 2, unit: 'cup' as never, confidence: 0.9, isLowConfidence: true } }),
    ]);
    expect(scanService.getBlockingReviewNames(stillBlocked)).toEqual(['Flour']);
  });

  it('removed detections do not block', async () => {
    const scan = scanWith([det({ name: 'Spinach', isRemoved: true, needsReview: true, reviewReasons: ['quantity_missing'] })]);
    expect(scanService.getBlockingReviewNames(scan)).toEqual([]);
  });

  it('confirmScan routes every detection through pantryService.createScanItem (shared path), never a direct write', async () => {
    const scan = scanWith([det({ name: 'Eggs' }), det({ ingredientId: 'ing-milk', name: 'Milk', quantity: { value: 1, unit: 'L', confidence: 0.9, isLowConfidence: false } })]);
    await scanService.confirmScan(scan);
    expect(createScanItem).toHaveBeenCalledTimes(2);
    expect(createScanItem).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'Eggs', unit: 'item' }), 'UTC');
  });

  it('a pantry write failure surfaces as ScanConfirmError with partial counts', async () => {
    createScanItem.mockImplementationOnce(async (p) => ({ id: '1', ...p })).mockRejectedValueOnce(new Error('rls'));
    const scan = scanWith([det({ name: 'Eggs' }), det({ name: 'Milk' })]);
    const err = await scanService.confirmScan(scan).catch((e) => e);
    expect(err).toBeInstanceOf(ScanConfirmError);
    expect(err).toMatchObject({ addedCount: 1, failedCount: 1 });
    // Scan stays 'confirming' (resumable) - never finalized on a partial failure.
    expect(finalizeScanConfirmation).not.toHaveBeenCalled();
  });
});

describe('confirmScan - durable, resumable, idempotent', () => {
  function scanWith(detections: ScanDetection[], id = 'client-scan-1', mode: Scan['mode'] = 'quick'): Scan {
    const section: ScanSectionResult = { section: 'quick', imageUri: 'p', detections, skipped: false };
    return { id, mode, status: 'reviewing', createdAt: '2026-09-05T00:00:00Z', sections: [section] };
  }
  function det(id: string, overrides: Partial<ScanDetection> = {}): ScanDetection {
    return {
      id,
      ingredientId: 'ing-eggs',
      name: 'Eggs',
      imageUri: '',
      category: 'protein',
      boundingBox: { x: 0, y: 0, width: 0.2, height: 0.2 },
      detectionConfidence: 0.9,
      quantity: { value: 2, unit: 'item', confidence: 0.9, isLowConfidence: false },
      freshness: { score: 50, confidence: 0, label: 'cant_tell' },
      ...overrides,
    };
  }

  it('first success: begins the scan, creates+links every detection, then finalizes', async () => {
    const scan = scanWith([det('d1'), det('d2', { ingredientId: 'ing-milk', name: 'Milk' })]);
    const { scan: out, summary } = await scanService.confirmScan(scan);

    expect(beginScanConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ clientScanId: 'client-scan-1', mode: 'quick', startedAt: '2026-09-05T00:00:00Z' }),
    );
    // the durable scan id (not the client id) is used to link + finalize
    expect(linkScanDetection).toHaveBeenCalledWith('scan-uuid-1', 'd1', 'item-Eggs');
    expect(linkScanDetection).toHaveBeenCalledWith('scan-uuid-1', 'd2', 'item-Milk');
    expect(finalizeScanConfirmation).toHaveBeenCalledWith('scan-uuid-1');
    expect(summary.ingredientsAdded).toBe(2);
    expect(out.status).toBe('confirmed');
  });

  it('passes the stable detection id as the pantry idempotency key', async () => {
    await scanService.confirmScan(scanWith([det('det-abc')]));
    expect(createScanItem).toHaveBeenCalledWith(
      expect.objectContaining({ sourceScanDetectionId: 'det-abc' }),
      'UTC',
    );
  });

  it('retry after a partial failure re-attempts ONLY the still-pending detection', async () => {
    // begin reports d1 already linked from a previous attempt, d2 still pending.
    beginScanConfirmation.mockResolvedValue({
      scanId: 'scan-uuid-1',
      status: 'confirming',
      detections: [
        { detectionId: 'd1', pantryItemId: 'item-existing' },
        { detectionId: 'd2', pantryItemId: null },
      ],
    });
    const scan = scanWith([det('d1'), det('d2', { name: 'Milk' })]);

    const { summary } = await scanService.confirmScan(scan);

    expect(createScanItem).toHaveBeenCalledTimes(1);
    expect(createScanItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Milk' }), 'UTC');
    expect(linkScanDetection).toHaveBeenCalledTimes(1);
    expect(linkScanDetection).toHaveBeenCalledWith('scan-uuid-1', 'd2', 'item-Milk');
    // both the previously-linked and the newly-linked detection count as added
    expect(summary.ingredientsAdded).toBe(2);
    expect(finalizeScanConfirmation).toHaveBeenCalledWith('scan-uuid-1');
  });

  it('a duplicate Confirm tap after everything linked creates no new pantry items', async () => {
    beginScanConfirmation.mockResolvedValue({
      scanId: 'scan-uuid-1',
      status: 'confirmed',
      detections: [{ detectionId: 'd1', pantryItemId: 'item-1' }],
    });
    const { summary } = await scanService.confirmScan(scanWith([det('d1')]));
    expect(createScanItem).not.toHaveBeenCalled();
    expect(linkScanDetection).not.toHaveBeenCalled();
    expect(finalizeScanConfirmation).toHaveBeenCalledWith('scan-uuid-1');
    expect(summary.ingredientsAdded).toBe(1);
  });

  it('lost response after a successful insert: retry re-runs the pending detection with the same key and finalizes', async () => {
    // 1st attempt: item is created but link fails (response lost).
    linkScanDetection.mockRejectedValueOnce(new Error('network'));
    const scan = scanWith([det('d1')]);
    await expect(scanService.confirmScan(scan)).rejects.toBeInstanceOf(ScanConfirmError);
    expect(finalizeScanConfirmation).not.toHaveBeenCalled();

    // 2nd attempt: begin still shows it pending; createScanItem is called again
    // with the SAME idempotency key (the DB returns the existing row), link ok.
    jest.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    countReadyToCookRecipes.mockResolvedValue(2);
    createScanItem.mockImplementation(async (p) => ({ id: 'item-existing', ...p }));
    beginScanConfirmation.mockResolvedValue({
      scanId: 'scan-uuid-1',
      status: 'confirming',
      detections: [{ detectionId: 'd1', pantryItemId: null }],
    });
    linkScanDetection.mockResolvedValue(undefined);
    finalizeScanConfirmation.mockResolvedValue({ id: 'scan-uuid-1', status: 'confirmed', confirmedAt: 'x' });

    const { summary } = await scanService.confirmScan(scan);
    expect(createScanItem).toHaveBeenCalledWith(expect.objectContaining({ sourceScanDetectionId: 'd1' }), 'UTC');
    expect(linkScanDetection).toHaveBeenCalledWith('scan-uuid-1', 'd1', 'item-existing');
    expect(finalizeScanConfirmation).toHaveBeenCalledWith('scan-uuid-1');
    expect(summary.ingredientsAdded).toBe(1);
  });

  it('a finalize failure is recoverable: a retry skips creation and finalizes cleanly', async () => {
    finalizeScanConfirmation.mockRejectedValueOnce(new Error('timeout'));
    const scan = scanWith([det('d1')]);
    await expect(scanService.confirmScan(scan)).rejects.toThrow('timeout');
    expect(createScanItem).toHaveBeenCalledTimes(1);

    // retry: begin shows d1 linked -> no new create, finalize succeeds
    beginScanConfirmation.mockResolvedValue({
      scanId: 'scan-uuid-1',
      status: 'confirming',
      detections: [{ detectionId: 'd1', pantryItemId: 'item-Eggs' }],
    });
    createScanItem.mockClear();
    finalizeScanConfirmation.mockResolvedValue({ id: 'scan-uuid-1', status: 'confirmed', confirmedAt: 'x' });

    const { scan: out } = await scanService.confirmScan(scan);
    expect(createScanItem).not.toHaveBeenCalled();
    expect(out.status).toBe('confirmed');
  });

  it('sends guided section state and per-detection sections; quick mode sends none', async () => {
    const guided: Scan = {
      id: 'client-scan-2',
      mode: 'guided',
      status: 'reviewing',
      createdAt: '2026-09-05T00:00:00Z',
      sections: [
        { section: 'fridge', imageUri: 'p', detections: [det('d1')], skipped: false },
        { section: 'freezer', imageUri: '', detections: [], skipped: true },
      ],
    };
    await scanService.confirmScan(guided);
    const payload = beginScanConfirmation.mock.calls[0][0];
    expect(payload.sections).toEqual([
      { section: 'fridge', skipped: false, sortOrder: 0 },
      { section: 'freezer', skipped: true, sortOrder: 1 },
    ]);
    expect(payload.detections[0]).toMatchObject({ detectionId: 'd1', section: 'fridge' });

    beginScanConfirmation.mockClear();
    await scanService.confirmScan(scanWith([det('q1')]));
    expect(beginScanConfirmation.mock.calls[0][0].sections).toEqual([]);
    expect(beginScanConfirmation.mock.calls[0][0].detections[0].section).toBeNull();
  });

  it('only a real catalog hit is sent as a canonical ingredient id', async () => {
    await scanService.confirmScan(
      scanWith([
        det('d1', { ingredientId: 'ing-eggs' }),
        det('d2', { ingredientId: 'ing-scan_xyz', name: 'Mystery Jar' }),
      ]),
    );
    const payload = beginScanConfirmation.mock.calls[0][0];
    expect(payload.detections[0].canonicalIngredientId).toBe('ing-eggs');
    expect(payload.detections[1].canonicalIngredientId).toBeNull();
  });

  it('confirming with nothing to save does not create a scan record', async () => {
    const scan = scanWith([det('d1', { isRemoved: true })]);
    await expect(scanService.confirmScan(scan)).rejects.toBeInstanceOf(ScanConfirmError);
    expect(beginScanConfirmation).not.toHaveBeenCalled();
  });
});

describe('scan history - real repository, no mock fallback', () => {
  it('getScanHistory requires auth and returns the repository result verbatim', async () => {
    const rows = [{ id: 's1', confirmedItemCount: 3 }];
    fetchConfirmedScans.mockResolvedValue(rows);
    await expect(scanService.getScanHistory()).resolves.toBe(rows);
    expect(fetchConfirmedScans).toHaveBeenCalledTimes(1);
  });

  it('getScanHistory rejects when signed out (no mock history is ever returned)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(scanService.getScanHistory()).rejects.toThrow('Not signed in');
    expect(fetchConfirmedScans).not.toHaveBeenCalled();
  });

  it('getScanDetail delegates to the repository', async () => {
    fetchScanDetail.mockResolvedValue({ id: 's1', detections: [] });
    await scanService.getScanDetail('s1');
    expect(fetchScanDetail).toHaveBeenCalledWith('s1');
  });

  it('the data barrel no longer exports MOCK_SCAN_HISTORY', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data = require('@/data') as Record<string, unknown>;
    expect(data.MOCK_SCAN_HISTORY).toBeUndefined();
  });
});
