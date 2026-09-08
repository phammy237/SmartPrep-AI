import * as repositories from '@/lib/supabase/repositories';
import { supabase } from '@/lib/supabase/client';
import { ReceiptOcrResult } from '@/types';
import { receiptService } from '../receiptService';

jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('@/lib/supabase/repositories', () => ({
  invokeReceiptOcr: jest.fn(),
  beginReceiptReview: jest.fn(),
}));

const repo = repositories as jest.Mocked<typeof repositories>;
const getUser = supabase.auth.getUser as jest.Mock;

const IMAGE = { base64: 'AAAA', mimeType: 'image/jpeg' };

function ocr(over: Partial<ReceiptOcrResult> = {}): ReceiptOcrResult {
  return {
    source: 'aws_textract',
    merchantName: 'Kroger',
    receiptDate: '2026-09-05',
    subtotal: 12.4,
    tax: 0.93,
    total: 13.33,
    lines: [
      { id: '0', rawText: 'BANANAS 2.14 LB', itemText: 'BANANAS', quantity: 2.14, unitText: 'lb', lineTotal: 1.47, providerMarkedItem: true, confidence: 96 },
      { id: '1', rawText: 'TAX 0.93', providerMarkedItem: false },
      { id: '2', rawText: 'GV WHT BREAD', itemText: 'GV WHT BREAD', providerMarkedItem: true, confidence: 91 },
    ],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('receiptService.processReceipt', () => {
  it('requires auth (no OCR call when unauthenticated)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(receiptService.processReceipt(IMAGE)).rejects.toThrow('Not signed in');
    expect(repo.invokeReceiptOcr).not.toHaveBeenCalled();
  });

  it('ok -> returns the OCR result + normalized candidates, noise dropped', async () => {
    repo.invokeReceiptOcr.mockResolvedValue({ status: 'ok', result: ocr() });
    const out = await receiptService.processReceipt(IMAGE);
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.candidates.map((c) => c.displayName)).toEqual(['Bananas', 'Gv Wht Bread']); // TAX line filtered
    expect(out.candidates[0]).toMatchObject({ candidateId: 'L0', quantity: 2.14, unit: 'lb', status: 'ready' });
  });

  it('no_line_items -> passes through with empty candidates (never a fake receipt)', async () => {
    repo.invokeReceiptOcr.mockResolvedValue({ status: 'no_line_items', result: ocr({ lines: [] }) });
    const out = await receiptService.processReceipt(IMAGE);
    expect(out).toMatchObject({ status: 'no_line_items', candidates: [] });
  });

  it('a provider error status is passed straight through', async () => {
    repo.invokeReceiptOcr.mockResolvedValue({ status: 'rate_limited' });
    expect(await receiptService.processReceipt(IMAGE)).toEqual({ status: 'rate_limited' });
  });

  it('an Edge Function auth failure surfaces as "Not signed in"', async () => {
    repo.invokeReceiptOcr.mockResolvedValue({ status: 'unauthenticated' });
    await expect(receiptService.processReceipt(IMAGE)).rejects.toThrow('Not signed in');
  });
});

describe('receiptService.beginReview', () => {
  it('persists candidates WITHOUT any price field, with merchant/date/lineCount', async () => {
    repo.beginReceiptReview.mockResolvedValue({ receiptScanId: 'scan-1', status: 'reviewing', items: [] });
    const result = ocr();
    const candidates = [
      { candidateId: 'L0', rawText: 'BANANAS 2.14 LB', displayName: 'Bananas', quantity: 2.14, unit: 'lb' as const, category: 'produce' as const, price: 1.47, selected: true, confidence: 'high' as const, status: 'ready' as const, sourceLineId: '0', reviewReasons: [] },
    ];

    await receiptService.beginReview({ clientReceiptId: 'rcpt-abc', ocr: result, candidates });

    expect(repo.beginReceiptReview).toHaveBeenCalledWith(
      expect.objectContaining({
        clientReceiptId: 'rcpt-abc',
        ocrSource: 'aws_textract',
        merchantName: 'Kroger',
        purchasedAt: '2026-09-05',
        lineCount: 3,
      }),
    );
    const sent = repo.beginReceiptReview.mock.calls[0][0].items[0];
    expect(sent).toEqual({
      candidate_id: 'L0',
      raw_text: 'BANANAS 2.14 LB',
      display_name: 'Bananas',
      quantity: 2.14,
      unit: 'lb',
      category: 'produce',
      ocr_confidence: null,
    });
    expect(sent).not.toHaveProperty('price');
  });
});
