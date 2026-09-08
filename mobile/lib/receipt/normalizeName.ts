/**
 * Conservative display-name normalization for a receipt line. It cleans obvious
 * OCR/formatting noise; it does NOT expand abbreviations as fact ("BNLS CHKN
 * BRST" stays "Bnls Chkn Brst" - the user corrects it in review). `rawText` is
 * always preserved separately by the caller.
 */

const LEADING_QTY_MARKER = /^\s*(\d+(?:\.\d+)?\s*(?:x|@|ea|lb|oz|kg|g|ct|pk)\b|\d+\s*[x@]\s*)/i;
const TRAILING_PRICE = /\s+[-$]?\$?\d+(?:\.\d{2})\s*[A-Z]?\s*$/;
const TRAILING_CODES = /\s+(?:\d{4,})\s*$/; // trailing bare product/PLU codes
const COLLAPSE_WS = /\s+/g;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(\d+)([a-z])/gi, (_m, d, l) => `${d}${l.toLowerCase()}`); // "2%" stays lowercase after digit
}

export function conservativeName(rawText: string): string {
  let s = String(rawText ?? '').replace(COLLAPSE_WS, ' ').trim();
  s = s.replace(LEADING_QTY_MARKER, '');
  s = s.replace(TRAILING_PRICE, '');
  s = s.replace(TRAILING_CODES, '');
  s = s.replace(/[*#]+/g, ' ').replace(COLLAPSE_WS, ' ').trim();
  // strip surrounding punctuation
  s = s.replace(/^[\s.,;:'"-]+|[\s.,;:'"-]+$/g, '').trim();
  if (s.length === 0) return String(rawText ?? '').trim();
  return titleCase(s);
}
