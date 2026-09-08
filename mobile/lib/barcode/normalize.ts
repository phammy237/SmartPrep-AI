/**
 * The ONE barcode normalization + validation helper. Camera detections and
 * manual entry both go through here before any product lookup.
 *
 * Barcodes are STRINGS, never numbers - leading zeros are significant and a
 * 13-digit EAN overflows nothing but must never lose its shape. Nothing in
 * this module calls `Number()` / `parseInt` on a barcode value.
 *
 * Check digits are validated deterministically (GS1 mod-10). A missing or
 * wrong check digit is reported, never silently "fixed".
 */

export type BarcodeFormat = 'upc_a' | 'upc_e' | 'ean_13' | 'ean_8';

export interface NormalizedBarcode {
  /** Digits only, canonical form. UPC-E input is expanded to its 12-digit UPC-A. */
  value: string;
  format: BarcodeFormat;
}

export type BarcodeValidationError =
  | 'empty'
  | 'non_numeric'
  | 'bad_length'
  | 'bad_check_digit';

export type BarcodeValidation =
  | { ok: true; barcode: NormalizedBarcode }
  | { ok: false; reason: BarcodeValidationError };

/** Strip whitespace, hyphens and common separators. Never touches the digits themselves. */
function stripSeparators(raw: string): string {
  return typeof raw === 'string' ? raw.replace(/[\s\-_.]/g, '') : '';
}

/**
 * GS1 mod-10 check digit for the given payload (all digits EXCEPT the check
 * digit). Rightmost payload digit is weighted x3, then alternating x1/x3.
 * Works for GTIN-8 / GTIN-12 / GTIN-13 payloads alike.
 */
export function gtinCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    const digit = payload.charCodeAt(payload.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** True when `code` (digits incl. check digit) has a valid trailing check digit. */
export function hasValidCheckDigit(code: string): boolean {
  if (code.length < 2) return false;
  const expected = gtinCheckDigit(code.slice(0, -1));
  return expected === code.charCodeAt(code.length - 1) - 48;
}

/**
 * Expand a UPC-E barcode to its equivalent 12-digit UPC-A (GS1 rules,
 * number system 0 or 1 only). Accepts a 6-digit payload, a 7-digit
 * numbersystem+payload, or a full 8-digit UPC-E (numbersystem+payload+check).
 * Returns null when the shape is wrong, the number system is not 0/1, or a
 * provided UPC-E check digit does not match. Never invents a check digit for
 * a code that carried a wrong one.
 */
export function expandUpcE(raw: string): string | null {
  const s = stripSeparators(raw);
  if (!/^\d+$/.test(s)) return null;

  let numberSystem = '0';
  let payload: string;
  let providedCheck: string | null = null;

  if (s.length === 6) {
    payload = s;
  } else if (s.length === 7) {
    numberSystem = s[0];
    payload = s.slice(1);
  } else if (s.length === 8) {
    numberSystem = s[0];
    payload = s.slice(1, 7);
    providedCheck = s[7];
  } else {
    return null;
  }

  if (numberSystem !== '0' && numberSystem !== '1') return null;

  const [a, b, c, d, e, f] = payload.split('');
  let middle: string;
  if (f === '0' || f === '1' || f === '2') {
    middle = `${a}${b}${f}0000${c}${d}${e}`;
  } else if (f === '3') {
    middle = `${a}${b}${c}00000${d}${e}`;
  } else if (f === '4') {
    middle = `${a}${b}${c}${d}00000${e}`;
  } else {
    middle = `${a}${b}${c}${d}${e}0000${f}`;
  }

  const eleven = numberSystem + middle; // 11 digits, no check digit yet
  if (eleven.length !== 11) return null;

  const check = gtinCheckDigit(eleven);
  if (providedCheck !== null && providedCheck !== String(check)) return null;
  return eleven + String(check);
}

export interface NormalizeOptions {
  /**
   * The camera reported this as a UPC-E symbol. We can then expand
   * unambiguously; an 8-digit value is otherwise treated as EAN-8.
   */
  upcE?: boolean;
}

/**
 * Normalize + validate a raw barcode string (from the camera or a text field).
 * Supported symbologies for packaged grocery: UPC-A, UPC-E (expanded to
 * UPC-A), EAN-13, EAN-8. Everything else is `bad_length`.
 */
export function normalizeBarcode(raw: string, opts: NormalizeOptions = {}): BarcodeValidation {
  const stripped = stripSeparators(raw ?? '');
  if (stripped.length === 0) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(stripped)) return { ok: false, reason: 'non_numeric' };

  if (opts.upcE) {
    const expanded = expandUpcE(stripped);
    if (!expanded) return { ok: false, reason: stripped.length === 6 || stripped.length === 7 || stripped.length === 8 ? 'bad_check_digit' : 'bad_length' };
    return { ok: true, barcode: { value: expanded, format: 'upc_e' } };
  }

  let format: BarcodeFormat;
  if (stripped.length === 8) format = 'ean_8';
  else if (stripped.length === 12) format = 'upc_a';
  else if (stripped.length === 13) format = 'ean_13';
  else return { ok: false, reason: 'bad_length' };

  if (!hasValidCheckDigit(stripped)) return { ok: false, reason: 'bad_check_digit' };
  return { ok: true, barcode: { value: stripped, format } };
}

/**
 * Alternate lookup keys to try for a normalized barcode, in order. A 12-digit
 * UPC-A is frequently stored by product databases as the zero-padded 13-digit
 * GTIN, so that padded form is a deterministic second attempt.
 */
export function lookupVariants(value: string): string[] {
  if (value.length === 12) return [value, `0${value}`];
  return [value];
}

/**
 * GS1 GTIN equivalence: two codes identify the same product iff their 14-digit
 * zero-padded forms are equal. Covers "UPC-A 012345678905" vs its GTIN-13
 * "0012345678905". This is the ONLY relationship the barcode intake treats as
 * "the same barcode" for USDA exact-match verification.
 *
 * NOTE: mirrored (deliberately, no cross-runtime import) in
 * supabase/functions/usda-lookup/normalize.ts#gtinEquivalent - keep in sync.
 */
export function gtinEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = typeof a === 'string' ? a.replace(/[\s-]/g, '') : '';
  const db = typeof b === 'string' ? b.replace(/[\s-]/g, '') : '';
  if (!/^\d{8,14}$/.test(da) || !/^\d{8,14}$/.test(db)) return false;
  return da.padStart(14, '0') === db.padStart(14, '0');
}
