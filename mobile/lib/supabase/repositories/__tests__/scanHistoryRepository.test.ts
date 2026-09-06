import { supabase } from '../../client';
import {
  beginScanConfirmation,
  fetchConfirmedScans,
  fetchScanDetail,
  finalizeScanConfirmation,
  linkScanDetection,
} from '../scanHistoryRepository';

jest.mock('../../client', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const from = supabase.from as jest.Mock;
const rpc = supabase.rpc as jest.Mock;

/** A chain where every builder method returns the chain and the terminals resolve. */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, jest.Mock> = {};
  ['select', 'eq'].forEach((m) => (c[m] = jest.fn(() => c)));
  c.order = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  return c;
}

const SCAN_ROW = {
  id: 'scan-uuid-1',
  user_id: 'user-1',
  client_scan_id: 'client-1',
  mode: 'guided' as const,
  status: 'confirmed' as const,
  started_at: '2026-09-05T10:00:00Z',
  confirmed_at: '2026-09-05T10:05:00Z',
  created_at: '2026-09-05T10:00:00Z',
  updated_at: '2026-09-05T10:05:00Z',
  scan_sections: [
    { id: 'ss2', scan_id: 'scan-uuid-1', section: 'pantry', skipped: true, sort_order: 1, created_at: 'x' },
    { id: 'ss1', scan_id: 'scan-uuid-1', section: 'fridge', skipped: false, sort_order: 0, created_at: 'x' },
  ],
  scan_detections: [
    {
      id: 'd-2', scan_id: 'scan-uuid-1', detection_id: 'det-2', section: 'fridge', display_name: 'Eggs',
      canonical_ingredient_id: 'ing-eggs', quantity: 6, unit: 'item', category: 'protein',
      identity_edited: false, quantity_edited: true, pantry_item_id: 'item-2',
      created_at: '2026-09-05T10:02:00Z', updated_at: 'x',
    },
    {
      id: 'd-1', scan_id: 'scan-uuid-1', detection_id: 'det-1', section: 'fridge', display_name: 'Milk',
      canonical_ingredient_id: 'ing-milk', quantity: 1, unit: 'L', category: 'dairy',
      identity_edited: false, quantity_edited: false, pantry_item_id: null,
      created_at: '2026-09-05T10:01:00Z', updated_at: 'x',
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

describe('fetchConfirmedScans', () => {
  it('queries confirmed scans newest-first and maps counts + preview + sorted sections', async () => {
    from.mockReturnValue(chain({ data: [SCAN_ROW], error: null }));

    const [record] = await fetchConfirmedScans();

    expect(from).toHaveBeenCalledWith('scans');
    const c = from.mock.results[0].value;
    expect(c.eq).toHaveBeenCalledWith('status', 'confirmed');
    expect(c.order).toHaveBeenCalledWith('confirmed_at', { ascending: false });

    expect(record.detectionCount).toBe(2);
    expect(record.confirmedItemCount).toBe(1); // only the linked detection
    expect(record.ingredientPreview).toEqual(['Eggs']);
    expect(record.sections).toEqual([
      { section: 'fridge', skipped: false },
      { section: 'pantry', skipped: true },
    ]);
  });

  it('throws on a query error', async () => {
    from.mockReturnValue(chain({ data: null, error: new Error('rls') }));
    await expect(fetchConfirmedScans()).rejects.toThrow('rls');
  });
});

describe('fetchScanDetail', () => {
  it('returns the scan with its detections sorted by created_at', async () => {
    from.mockReturnValue(chain({ data: SCAN_ROW, error: null }));

    const detail = await fetchScanDetail('scan-uuid-1');

    expect(from.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'scan-uuid-1');
    expect(detail?.detections.map((d) => d.detectionId)).toEqual(['det-1', 'det-2']);
    expect(detail?.detections[0]).toMatchObject({ name: 'Milk', pantryItemId: null, quantityEdited: false });
    expect(detail?.detections[1]).toMatchObject({ name: 'Eggs', pantryItemId: 'item-2', quantityEdited: true });
  });

  it('returns null when the scan is not found / not owned', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    await expect(fetchScanDetail('nope')).resolves.toBeNull();
  });
});

describe('beginScanConfirmation', () => {
  it('sends snake_case section + detection payloads and returns the RPC result verbatim', async () => {
    const result = { scanId: 'scan-uuid-1', status: 'confirming', detections: [] };
    rpc.mockResolvedValue({ data: result, error: null });

    const out = await beginScanConfirmation({
      clientScanId: 'client-1',
      mode: 'guided',
      startedAt: '2026-09-05T10:00:00Z',
      sections: [{ section: 'fridge', skipped: false, sortOrder: 0 }],
      detections: [
        {
          detectionId: 'det-1',
          section: 'fridge',
          displayName: 'Milk',
          canonicalIngredientId: 'ing-milk',
          quantity: 1,
          unit: 'L',
          category: 'dairy',
          identityEdited: false,
          quantityEdited: true,
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith('begin_scan_confirmation', {
      p_client_scan_id: 'client-1',
      p_mode: 'guided',
      p_started_at: '2026-09-05T10:00:00Z',
      p_sections: [{ section: 'fridge', skipped: false, sort_order: 0 }],
      p_detections: [
        {
          detection_id: 'det-1',
          section: 'fridge',
          display_name: 'Milk',
          canonical_ingredient_id: 'ing-milk',
          quantity: 1,
          unit: 'L',
          category: 'dairy',
          identity_edited: false,
          quantity_edited: true,
        },
      ],
    });
    expect(out).toBe(result);
  });

  it('throws on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('not authenticated') });
    await expect(
      beginScanConfirmation({ clientScanId: 'c', mode: 'quick', sections: [], detections: [] }),
    ).rejects.toThrow('not authenticated');
  });
});

describe('linkScanDetection', () => {
  it('calls the RPC with the durable scan id, detection id and pantry item id', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await linkScanDetection('scan-uuid-1', 'det-1', 'item-1');
    expect(rpc).toHaveBeenCalledWith('link_scan_detection', {
      p_scan_id: 'scan-uuid-1',
      p_detection_id: 'det-1',
      p_pantry_item_id: 'item-1',
    });
  });

  it('throws on an RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('linked to a different pantry item') });
    await expect(linkScanDetection('s', 'd', 'i')).rejects.toThrow('different pantry item');
  });
});

describe('finalizeScanConfirmation', () => {
  it('maps the returned scans row to a compact status object', async () => {
    rpc.mockResolvedValue({
      data: { ...SCAN_ROW, status: 'confirmed', confirmed_at: '2026-09-05T10:05:00Z' },
      error: null,
    });
    await expect(finalizeScanConfirmation('scan-uuid-1')).resolves.toEqual({
      id: 'scan-uuid-1',
      status: 'confirmed',
      confirmedAt: '2026-09-05T10:05:00Z',
    });
    expect(rpc).toHaveBeenCalledWith('finalize_scan_confirmation', { p_scan_id: 'scan-uuid-1' });
  });
});
