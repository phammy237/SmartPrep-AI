import { classifyLine, isNoiseText } from '../noiseFilter';
import { conservativeName } from '../normalizeName';
import { parseReceiptQuantity } from '../quantity';
import { receiptUnitToPantry } from '../unitMap';
import { ReceiptRawLine } from '@/types';

function line(over: Partial<ReceiptRawLine> = {}): ReceiptRawLine {
  return { id: '0', rawText: '', providerMarkedItem: false, ...over };
}

// ---------------------------------------------------------------------------
// noise filtering (§45)
// ---------------------------------------------------------------------------

describe('isNoiseText', () => {
  it('flags totals / tax / subtotal / payment / loyalty / deposits', () => {
    for (const t of [
      'SUBTOTAL 42.10',
      'TAX 3.16',
      'TOTAL 45.26',
      'BALANCE DUE 45.26',
      'VISA DEBIT ************1234',
      'CHANGE DUE 0.00',
      'MFR COUPON -1.00',
      'STORE SAVINGS 2.50',
      'FUEL POINTS EARNED 45',
      'CRV 0.05',
      'BOTTLE DEPOSIT 0.10',
      'CASHIER: 0472',
      'THANK YOU FOR SHOPPING',
      '------------------',
    ]) {
      expect(isNoiseText(t)).toBe(true);
    }
  });

  it('does not flag real grocery items', () => {
    for (const t of ['BANANAS 2.14 LB', 'GV WHT BREAD', '2% GAL MILK', 'ORG BABY SPINACH', 'CHICKEN BREAST BNLS']) {
      expect(isNoiseText(t)).toBe(false);
    }
  });
});

describe('classifyLine', () => {
  it('a provider-marked ITEM is always an item (heuristics never override)', () => {
    expect(classifyLine(line({ providerMarkedItem: true, itemText: 'BANANAS' }))).toBe('item');
    // even if the text superficially contains a noise-ish word
    expect(classifyLine(line({ providerMarkedItem: true, itemText: 'TOTAL WINE MERLOT' }))).toBe('item');
  });

  it('an obvious non-item with no ITEM field is noise', () => {
    expect(classifyLine(line({ rawText: 'TAX 3.16' }))).toBe('noise');
    expect(classifyLine(line({ rawText: 'TOTAL 45.26' }))).toBe('noise');
  });

  it('a plain non-provider line that reads like a product is an item', () => {
    expect(classifyLine(line({ rawText: 'KROGER 2% MILK', itemText: 'KROGER 2% MILK' }))).toBe('item');
  });

  it('a bare, uncertain line stays ambiguous (reviewable, never silently dropped)', () => {
    expect(classifyLine(line({ rawText: 'X' }))).toBe('ambiguous');
  });
});

// ---------------------------------------------------------------------------
// unit mapping (§13, §46)
// ---------------------------------------------------------------------------

describe('receiptUnitToPantry', () => {
  it('maps deterministic receipt units', () => {
    expect(receiptUnitToPantry('LB')).toBe('lb');
    expect(receiptUnitToPantry('lbs')).toBe('lb');
    expect(receiptUnitToPantry('OZ')).toBe('oz');
    expect(receiptUnitToPantry('KG')).toBe('kg');
    expect(receiptUnitToPantry('G')).toBe('g');
    expect(receiptUnitToPantry('L')).toBe('L');
    expect(receiptUnitToPantry('ML')).toBe('ml');
  });

  it('maps count tokens to item', () => {
    expect(receiptUnitToPantry('EA')).toBe('item');
    expect(receiptUnitToPantry('EACH')).toBe('item');
    expect(receiptUnitToPantry('CT')).toBe('item');
  });

  it('leaves unsupported / ambiguous units unresolved (no fabrication)', () => {
    expect(receiptUnitToPantry('PT')).toBeUndefined();
    expect(receiptUnitToPantry('DZ')).toBeUndefined();
    expect(receiptUnitToPantry('')).toBeUndefined();
    expect(receiptUnitToPantry(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// quantity semantics (§12, §46)
// ---------------------------------------------------------------------------

describe('parseReceiptQuantity', () => {
  it('"2.14 LB BANANAS" -> weight quantity + unit (strong evidence)', () => {
    expect(parseReceiptQuantity('BANANAS 2.14 LB')).toMatchObject({ quantity: 2.14, unit: 'lb', needsReview: false });
  });

  it('provider structured quantity + supported unit is used directly', () => {
    expect(parseReceiptQuantity('APPLES', 3, 'lb')).toMatchObject({ quantity: 3, unit: 'lb', needsReview: false });
  });

  it('"MILK 2 @ 3.99" -> 2 items (packages), NOT 2 grams', () => {
    expect(parseReceiptQuantity('MILK 2 @ 3.99')).toMatchObject({ quantity: 2, unit: 'item', needsReview: false });
  });

  it('a bare trailing count reads as units', () => {
    expect(parseReceiptQuantity('YOGURT', 4, null)).toMatchObject({ quantity: 4, unit: 'item', needsReview: false });
  });

  it('one package, no amount at all -> 1 item flagged for review', () => {
    expect(parseReceiptQuantity('BREAD')).toMatchObject({ quantity: 1, unit: 'item', needsReview: true });
  });

  it('a weight amount with an unsupported unit keeps the number but flags review', () => {
    const r = parseReceiptQuantity('DELI HAM 0.75 PT');
    expect(r.quantity).toBe(0.75);
    expect(r.unit).toBeUndefined();
    expect(r.needsReview).toBe(true);
  });

  it('a non-integer count with no unit is ambiguous', () => {
    const r = parseReceiptQuantity('BULK NUTS', 1.5, null);
    expect(r.quantity).toBe(1.5);
    expect(r.unit).toBeUndefined();
    expect(r.needsReview).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// conservative name normalization (§10, §11)
// ---------------------------------------------------------------------------

describe('conservativeName', () => {
  it('collapses whitespace, strips trailing price + leading qty markers, title-cases', () => {
    expect(conservativeName('  GV  WHT  BREAD   1.28 F ')).toBe('Gv Wht Bread');
    expect(conservativeName('2 X ORG BANANAS')).toBe('Org Bananas');
    expect(conservativeName('GALA APPLE   ***')).toBe('Gala Apple');
  });

  it('does NOT expand abbreviations - "BNLS CHKN BRST" stays "Bnls Chkn Brst"', () => {
    expect(conservativeName('BNLS CHKN BRST')).toBe('Bnls Chkn Brst');
  });

  it('never returns empty - falls back to the raw text', () => {
    expect(conservativeName('   ')).toBe('');
    expect(conservativeName('4.99')).toBe('4.99');
  });
});
