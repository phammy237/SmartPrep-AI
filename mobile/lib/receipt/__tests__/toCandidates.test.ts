import { ReceiptOcrResult, ReceiptRawLine } from '@/types';
import { ocrResultToCandidates } from '../toCandidates';

function line(over: Partial<ReceiptRawLine> & { id: string }): ReceiptRawLine {
  return { rawText: '', providerMarkedItem: false, ...over };
}

function result(lines: ReceiptRawLine[], over: Partial<ReceiptOcrResult> = {}): ReceiptOcrResult {
  return { source: 'aws_textract', merchantName: 'Kroger', receiptDate: '2026-09-05', lines, ...over };
}

describe('ocrResultToCandidates', () => {
  it('drops noise lines and keeps grocery items', () => {
    const cands = ocrResultToCandidates(
      result([
        line({ id: '0', providerMarkedItem: true, itemText: 'BANANAS 2.14 LB', quantity: 2.14, unitText: 'lb', confidence: 96 }),
        line({ id: '1', providerMarkedItem: true, itemText: 'CHICKEN BREAST', quantity: 1, confidence: 92 }),
        line({ id: '2', rawText: 'SUBTOTAL 12.40' }),
        line({ id: '3', rawText: 'TAX 0.93' }),
        line({ id: '4', rawText: 'TOTAL 13.33' }),
      ]),
    );
    expect(cands.map((c) => c.displayName)).toEqual(['Bananas 2.14 Lb', 'Chicken Breast']);
    expect(cands.map((c) => c.candidateId)).toEqual(['L0', 'L1']);
  });

  it('a clean provider item with weight + unit is ready and pre-selected', () => {
    const [c] = ocrResultToCandidates(
      result([line({ id: '7', providerMarkedItem: true, itemText: 'BANANAS 2.14 LB', quantity: 2.14, unitText: 'lb', confidence: 97 })]),
    );
    expect(c.status).toBe('ready');
    expect(c.selected).toBe(true);
    expect(c).toMatchObject({ quantity: 2.14, unit: 'lb', confidence: 'high' });
  });

  it('resolves an EXACT canonical name (and takes its category); leaves an abbreviation unresolved', () => {
    const [chicken, abbr] = ocrResultToCandidates(
      result([
        line({ id: '0', providerMarkedItem: true, itemText: 'chicken breast', quantity: 1, unitText: 'lb', confidence: 95 }),
        line({ id: '1', providerMarkedItem: true, itemText: 'BNLS CHKN BRST', quantity: 1, unitText: 'lb', confidence: 95 }),
      ]),
    );
    expect(chicken.canonicalIngredientId).toBe('ing-chicken-breast');
    expect(chicken.category).toBe('protein');
    expect(abbr.canonicalIngredientId).toBeUndefined();
    expect(abbr.reviewReasons).toContain('identity_unresolved');
    // an unresolved identity does NOT block - qty/unit/confidence are fine here
    expect(abbr.status).toBe('ready');
  });

  it('a provider ITEM signal outranks a weak text heuristic', () => {
    const [c] = ocrResultToCandidates(
      result([line({ id: '0', providerMarkedItem: true, itemText: 'TOTAL WINE CABERNET', quantity: 1, unitText: 'bottle', confidence: 90 })]),
    );
    expect(c.displayName).toBe('Total Wine Cabernet');
    expect(c.status).toBe('ready');
  });

  it('an ambiguous line is kept for review, not silently dropped, and not pre-selected', () => {
    const [c] = ocrResultToCandidates(result([line({ id: '0', rawText: 'QX' })]));
    expect(c.status).toBe('needs_review');
    expect(c.selected).toBe(false);
    expect(c.reviewReasons).toContain('ambiguous_line');
  });

  it('an amount with an unsupported unit keeps the number but flags unit_unresolved + needs_review', () => {
    const [c] = ocrResultToCandidates(
      result([line({ id: '0', providerMarkedItem: true, itemText: 'DELI TURKEY 0.8 PT', quantity: 1, confidence: 92 })]),
    );
    expect(c.quantity).toBe(0.8);
    expect(c.unit).toBeUndefined();
    expect(c.reviewReasons).toContain('unit_unresolved');
    expect(c.status).toBe('needs_review');
  });

  it('a bare item with no amount at all -> 1 item, flagged quantity_missing', () => {
    const [c] = ocrResultToCandidates(
      result([line({ id: '0', providerMarkedItem: true, itemText: 'PAPER TOWELS', confidence: 92 })]),
    );
    expect(c).toMatchObject({ quantity: 1, unit: 'item' });
    expect(c.reviewReasons).toContain('quantity_missing');
    expect(c.status).toBe('needs_review');
  });

  it('low OCR confidence forces needs_review even with a usable quantity', () => {
    const [c] = ocrResultToCandidates(
      result([line({ id: '0', providerMarkedItem: true, itemText: 'MILK 1 GAL', quantity: 1, unitText: 'ea', confidence: 40 })]),
    );
    expect(c.confidence).toBe('low');
    expect(c.status).toBe('needs_review');
    expect(c.reviewReasons).toContain('low_ocr_confidence');
  });

  it('is deterministic - same input, same candidate ids and order', () => {
    const lines = [
      line({ id: '0', providerMarkedItem: true, itemText: 'APPLES', quantity: 3, unitText: 'lb', confidence: 90 }),
      line({ id: '1', providerMarkedItem: true, itemText: 'BREAD', quantity: 1, confidence: 90 }),
    ];
    const a = ocrResultToCandidates(result(lines)).map((c) => c.candidateId);
    const b = ocrResultToCandidates(result([...lines].reverse())).map((c) => c.candidateId);
    expect(a).toEqual(['L0', 'L1']);
    expect(b).toEqual(['L1', 'L0']);
  });
});
