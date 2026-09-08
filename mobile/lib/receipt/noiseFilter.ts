/**
 * Deterministic receipt-noise classification. PROVIDER STRUCTURE FIRST: if the
 * OCR provider tagged a line as an ITEM, we trust that over any text heuristic.
 * The keyword list only rules OUT obvious non-item lines (totals, tax, payment,
 * loyalty, deposits, ...) and only when the provider did NOT mark the line as an
 * item. Anything left ambiguous stays reviewable - never silently dropped.
 *
 * This is intentionally small. Grocery-receipt language is not universal; a
 * giant regex system would be fragile and wrong more often than a short list
 * plus a human review pass.
 */

import { ReceiptRawLine } from '@/types';

export type LineClass = 'item' | 'noise' | 'ambiguous';

/** Whole-line tokens that are never a grocery item. Matched case-insensitively against the collapsed line. */
const NOISE_PATTERNS: RegExp[] = [
  /\b(sub[\s-]?total|subtotal)\b/i,
  /\b(total|balance due|amount due|grand total)\b/i,
  /\btax\b/i,
  /\b(cash|change|change due|tend(er|ered)?)\b/i,
  /\b(visa|mastercard|amex|discover|debit|credit|card|acct|account|auth|approval|ref(erence)?\s*#?)\b/i,
  /\b(coupon|discount|savings|save[d]?|mfr\b|manufacturer coupon|instant savings)\b/i,
  /\b(loyalty|rewards?|member(ship)?|points?|fuel points)\b/i,
  /\b(bottle deposit|crv|deposit|bag fee|bag charge|env(ironment)?al fee)\b/i,
  /\b(receipt|transaction|store\s*#?|reg(ister)?\s*#?|cashier|clerk|lane|term(inal)?)\b/i,
  /\b(items? sold|item count|qty sold|number of items)\b/i,
  /\bthank you\b/i,
  /^[\s*\-=_.]+$/, // separator lines
];

/** True when this collapsed line clearly is NOT a grocery item. */
export function isNoiseText(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  return NOISE_PATTERNS.some((re) => re.test(t));
}

/**
 * Classify one raw OCR line.
 *   - provider marked it an ITEM         -> 'item' (heuristics can't override this)
 *   - obvious non-item text              -> 'noise'
 *   - provider gave a usable item value  -> 'item'
 *   - everything else                    -> 'ambiguous' (goes to review, not the bin)
 */
export function classifyLine(line: ReceiptRawLine): LineClass {
  if (line.providerMarkedItem && (line.itemText?.trim().length ?? 0) > 0) return 'item';

  const text = (line.itemText ?? line.rawText ?? '').trim();
  if (isNoiseText(text)) return 'noise';

  if (line.providerMarkedItem || (line.itemText?.trim().length ?? 0) > 1) return 'item';
  return 'ambiguous';
}
