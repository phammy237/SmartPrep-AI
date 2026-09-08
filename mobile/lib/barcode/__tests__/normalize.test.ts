import { expandUpcE, gtinCheckDigit, gtinEquivalent, hasValidCheckDigit, lookupVariants, normalizeBarcode } from '../normalize';

describe('gtinCheckDigit / hasValidCheckDigit', () => {
  it('computes the GS1 mod-10 check digit', () => {
    expect(gtinCheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
    expect(gtinCheckDigit('301762042200')).toBe(3); // EAN-13 3017620422003
    expect(gtinCheckDigit('7351353')).toBe(7); // EAN-8 73513537
  });

  it('validates a full code including its check digit', () => {
    expect(hasValidCheckDigit('036000291452')).toBe(true);
    expect(hasValidCheckDigit('036000291453')).toBe(false);
    expect(hasValidCheckDigit('3017620422003')).toBe(true);
    expect(hasValidCheckDigit('73513537')).toBe(true);
  });
});

describe('normalizeBarcode', () => {
  it('accepts a valid UPC-A (12 digits)', () => {
    expect(normalizeBarcode('036000291452')).toEqual({ ok: true, barcode: { value: '036000291452', format: 'upc_a' } });
  });

  it('accepts a valid EAN-13 (13 digits)', () => {
    expect(normalizeBarcode('3017620422003')).toEqual({ ok: true, barcode: { value: '3017620422003', format: 'ean_13' } });
  });

  it('accepts a valid EAN-8 (8 digits)', () => {
    expect(normalizeBarcode('73513537')).toEqual({ ok: true, barcode: { value: '73513537', format: 'ean_8' } });
  });

  it('preserves a leading zero (barcode is a string, never a number)', () => {
    const out = normalizeBarcode('  0036000291452  '); // 13-digit, 0-padded UPC-A
    expect(out).toEqual({ ok: true, barcode: { value: '0036000291452', format: 'ean_13' } });
    if (out.ok) expect(out.barcode.value[0]).toBe('0');
  });

  it('strips whitespace, hyphens and dots from the input', () => {
    expect(normalizeBarcode('0-36000-29145-2')).toEqual({ ok: true, barcode: { value: '036000291452', format: 'upc_a' } });
    expect(normalizeBarcode('3 017 620 422 003')).toEqual({ ok: true, barcode: { value: '3017620422003', format: 'ean_13' } });
  });

  it('rejects an empty value', () => {
    expect(normalizeBarcode('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects non-numeric characters', () => {
    expect(normalizeBarcode('03600029145X')).toEqual({ ok: false, reason: 'non_numeric' });
  });

  it('rejects an unsupported length', () => {
    expect(normalizeBarcode('12345')).toEqual({ ok: false, reason: 'bad_length' });
    expect(normalizeBarcode('123456789012345')).toEqual({ ok: false, reason: 'bad_length' });
  });

  it('rejects a wrong check digit (deterministic, never "fixed")', () => {
    expect(normalizeBarcode('036000291453')).toEqual({ ok: false, reason: 'bad_check_digit' });
    expect(normalizeBarcode('3017620422000')).toEqual({ ok: false, reason: 'bad_check_digit' });
  });

  it('expands a UPC-E symbol to its 12-digit UPC-A when the camera reports it', () => {
    const out = normalizeBarcode('654321', { upcE: true });
    expect(out).toEqual({ ok: true, barcode: { value: '065100004327', format: 'upc_e' } });
  });

  it('treats an 8-digit value as EAN-8 unless the camera flags UPC-E', () => {
    expect(normalizeBarcode('73513537').ok).toBe(true); // EAN-8
    expect(normalizeBarcode('73513537').ok && (normalizeBarcode('73513537') as { barcode: { format: string } }).barcode.format).toBe('ean_8');
  });
});

describe('expandUpcE', () => {
  it('expands a 6-digit payload (number system 0) and appends the correct check digit', () => {
    expect(expandUpcE('654321')).toBe('065100004327');
  });

  it('accepts a full 8-digit UPC-E and validates its provided check digit', () => {
    expect(expandUpcE('06543217')).toBe('065100004327');
    expect(expandUpcE('06543210')).toBeNull(); // wrong provided check digit -> not "fixed"
  });

  it('rejects a non-0/1 number system and a wrong length', () => {
    expect(expandUpcE('2654321')).toBeNull();
    expect(expandUpcE('12345')).toBeNull();
  });
});

describe('gtinEquivalent (the ONLY "same barcode" rule for USDA exact-match verification)', () => {
  it('treats a UPC-A and its zero-padded GTIN-13 as the same product', () => {
    expect(gtinEquivalent('012345678905', '0012345678905')).toBe(true);
    expect(gtinEquivalent('036000291452', '0036000291452')).toBe(true);
  });

  it('is true for identical codes, false for a different check digit / different code', () => {
    expect(gtinEquivalent('3017620422003', '3017620422003')).toBe(true);
    expect(gtinEquivalent('012345678905', '012345678912')).toBe(false);
  });

  it('rejects empty, non-numeric, too-short, or nullish inputs', () => {
    expect(gtinEquivalent('', '012345678905')).toBe(false);
    expect(gtinEquivalent('12ab', '012345678905')).toBe(false);
    expect(gtinEquivalent('1234567', '012345678905')).toBe(false); // 7 digits
    expect(gtinEquivalent(null, '012345678905')).toBe(false);
    expect(gtinEquivalent(undefined, undefined)).toBe(false);
  });

  it('matches the Edge Function mirror behaviour for the padded EAN-8 / EAN-13 cases', () => {
    expect(gtinEquivalent('73513537', '0000073513537')).toBe(true);
  });
});

describe('lookupVariants', () => {
  it('adds the zero-padded 13-digit GTIN for a 12-digit UPC-A', () => {
    expect(lookupVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
  });

  it('returns just the value for EAN-13 / EAN-8', () => {
    expect(lookupVariants('3017620422003')).toEqual(['3017620422003']);
    expect(lookupVariants('73513537')).toEqual(['73513537']);
  });
});
