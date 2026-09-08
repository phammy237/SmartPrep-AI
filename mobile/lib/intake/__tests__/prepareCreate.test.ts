import { IntakeCandidate } from '../types';
import { prepareIntakeCreateInput } from '../prepareCreate';

const CORE = {
  displayName: 'Chobani Nonfat Greek Yogurt, Vanilla',
  category: 'dairy' as const,
  quantity: 2,
  unit: 'item' as const,
};

function barcode(over: Partial<IntakeCandidate> = {}): IntakeCandidate {
  return { ...CORE, provenance: 'barcode', barcode: '036000291452', brand: 'Chobani', ...over } as IntakeCandidate;
}
function receipt(over: Partial<IntakeCandidate> = {}): IntakeCandidate {
  return {
    ...CORE,
    provenance: 'receipt',
    receiptScanId: '11111111-1111-1111-1111-111111111111',
    candidateId: 'L3',
    rawText: 'CHOBANI TRZ VAN',
    ...over,
  } as IntakeCandidate;
}

describe('prepareIntakeCreateInput - the shared intake spine', () => {
  it('barcode candidate -> source barcode, carries barcode/brand/fdcId, NO receipt fields', () => {
    const p = prepareIntakeCreateInput(barcode({ fdcId: '2666511' }));
    expect(p).toMatchObject({ source: 'barcode', barcode: '036000291452', brand: 'Chobani', fdcId: '2666511' });
    expect(p.sourceReceiptCandidateId).toBeUndefined();
    expect(p.sourceReceiptId).toBeUndefined();
  });

  it('receipt candidate -> source receipt, carries the candidate + scan ids, NO barcode fields', () => {
    const p = prepareIntakeCreateInput(receipt());
    expect(p).toMatchObject({
      source: 'receipt',
      sourceReceiptCandidateId: 'L3',
      sourceReceiptId: '11111111-1111-1111-1111-111111111111',
    });
    expect(p.barcode).toBeUndefined();
    expect(p.brand).toBeUndefined();
    expect(p.fdcId).toBeUndefined();
  });

  it('an EXACT canonical name resolves (both sources), otherwise a source-specific synthetic id', () => {
    const canonBarcode = prepareIntakeCreateInput(barcode({ displayName: 'Chicken Breast' }));
    expect(canonBarcode).toMatchObject({ ingredientId: 'ing-chicken-breast', canonicalIdentity: true });

    const canonReceipt = prepareIntakeCreateInput(receipt({ displayName: 'chicken breast' }));
    expect(canonReceipt).toMatchObject({ ingredientId: 'ing-chicken-breast', canonicalIdentity: true });

    const brandedBarcode = prepareIntakeCreateInput(barcode());
    expect(brandedBarcode.canonicalIdentity).toBe(false);
    expect(brandedBarcode.ingredientId).toMatch(/^ing-barcode/);

    const brandedReceipt = prepareIntakeCreateInput(receipt({ displayName: 'BNLS CHKN BRST' }));
    expect(brandedReceipt.canonicalIdentity).toBe(false);
    expect(brandedReceipt.ingredientId).toMatch(/^ing-receipt/);
  });

  it('no dates -> expirationConfidence unknown, NO fabricated expiry (both sources)', () => {
    for (const c of [barcode(), receipt()]) {
      const p = prepareIntakeCreateInput(c);
      expect(p.expirationConfidence).toBe('unknown');
      expect(p.estimatedExpirationDate).toBeUndefined();
    }
  });

  it('a printed best-by date -> confidence high + that date', () => {
    const p = prepareIntakeCreateInput(receipt({ userProvidedDate: '2026-12-31', userProvidedDateType: 'best_by' }));
    expect(p).toMatchObject({ expirationConfidence: 'high', estimatedExpirationDate: '2026-12-31' });
  });

  it('a purchase date drives the category heuristic -> confidence medium + an estimated date', () => {
    const p = prepareIntakeCreateInput(receipt({ purchaseDate: '2026-09-05', category: 'produce' }));
    expect(p.expirationConfidence).toBe('medium');
    expect(p.estimatedExpirationDate).toBeTruthy();
  });

  it('a barcode https provider image is used as the pantry image only when identity is non-canonical', () => {
    const branded = prepareIntakeCreateInput(barcode({ imageUrl: 'https://images.openfoodfacts.org/x.jpg' }));
    expect(branded.imageUri).toBe('https://images.openfoodfacts.org/x.jpg');

    const canon = prepareIntakeCreateInput(barcode({ displayName: 'Chicken Breast', imageUrl: 'https://images.openfoodfacts.org/x.jpg' }));
    expect(canon.imageUri).not.toBe('https://images.openfoodfacts.org/x.jpg'); // catalog photo wins
  });

  it('receipt raw text never becomes the display name or the ingredient id', () => {
    const p = prepareIntakeCreateInput(receipt({ displayName: 'Organic Bananas', rawText: '2 X ORG BAN' }));
    expect(p.displayName).toBe('Organic Bananas');
    expect(p.ingredientId).not.toContain('ORG BAN');
  });
});
