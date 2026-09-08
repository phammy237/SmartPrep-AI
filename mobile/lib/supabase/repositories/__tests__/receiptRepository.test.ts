import { supabase } from '../../client';
import {
  beginReceiptReview,
  finalizeReceiptReview,
  invokeReceiptOcr,
  linkReceiptScanItem,
} from '../receiptRepository';

jest.mock('../../client', () => ({
  supabase: { functions: { invoke: jest.fn() }, rpc: jest.fn() },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const rpc = supabase.rpc as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('invokeReceiptOcr', () => {
  it('calls the receipt-ocr Edge Function with the image and passes the result through', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', result: { source: 'aws_textract', lines: [] } }, error: null });
    const r = await invokeReceiptOcr({ base64: 'AAA', mimeType: 'image/jpeg' });
    expect(invoke).toHaveBeenCalledWith('receipt-ocr', { body: { image: { base64: 'AAA', mimeType: 'image/jpeg' } } });
    expect(r.status).toBe('ok');
  });

  it('propagates an Edge Function transport error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('function failed') });
    await expect(invokeReceiptOcr({ base64: 'A', mimeType: 'image/png' })).rejects.toThrow('function failed');
  });
});

describe('receipt session RPCs', () => {
  it('beginReceiptReview sends the session + items and maps the result', async () => {
    rpc.mockResolvedValue({
      data: { receiptScanId: 'scan-1', status: 'reviewing', items: [{ candidateId: 'L0', pantryItemId: null, candidateStatus: 'pending' }] },
      error: null,
    });
    const state = await beginReceiptReview({
      clientReceiptId: 'rcpt-1',
      merchantName: 'Kroger',
      purchasedAt: '2026-09-05',
      items: [{ candidate_id: 'L0', raw_text: 'BANANAS', display_name: 'Bananas', quantity: 1, unit: 'item', category: 'produce', ocr_confidence: null }],
    });
    expect(rpc).toHaveBeenCalledWith('begin_receipt_review', expect.objectContaining({
      p_client_receipt_id: 'rcpt-1',
      p_merchant_name: 'Kroger',
      p_purchased_at: '2026-09-05',
      p_line_count: 1,
    }));
    expect(state).toMatchObject({ receiptScanId: 'scan-1', status: 'reviewing' });
    expect(state.items).toHaveLength(1);
  });

  it('linkReceiptScanItem forwards the (scan, candidate, item) triple', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await linkReceiptScanItem('scan-1', 'L0', 'item-1');
    expect(rpc).toHaveBeenCalledWith('link_receipt_scan_item', {
      p_receipt_scan_id: 'scan-1',
      p_candidate_id: 'L0',
      p_pantry_item_id: 'item-1',
    });
  });

  it('linkReceiptScanItem propagates a "linked to a different item" rejection', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('already linked to a different pantry item') });
    await expect(linkReceiptScanItem('scan-1', 'L0', 'item-2')).rejects.toThrow('different pantry item');
  });

  it('finalizeReceiptReview sends skipped ids and returns the session status', async () => {
    rpc.mockResolvedValue({ data: { id: 'scan-1', status: 'partial', item_count: 8 }, error: null });
    const summary = await finalizeReceiptReview('scan-1', ['L3', 'L4']);
    expect(rpc).toHaveBeenCalledWith('finalize_receipt_review', { p_receipt_scan_id: 'scan-1', p_skipped_candidate_ids: ['L3', 'L4'] });
    expect(summary).toEqual({ id: 'scan-1', status: 'partial', itemCount: 8 });
  });
});
