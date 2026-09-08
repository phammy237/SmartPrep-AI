/**
 * Receipt quantity semantics. Receipt quantity is NOT always pantry quantity:
 *
 *   "BANANAS 2.14 LB"   -> quantity 2.14, unit lb        (weight - strong evidence)
 *   "MILK 2 @ 3.99"     -> quantity 2, unit item         (2 packages; volume unknown)
 *   "YOGURT 4"          -> quantity 4, unit item         (four units, NOT four grams)
 *   "CHIPS"             -> quantity 1, unit item, review (no amount at all)
 *
 * A bare count is never reinterpreted as mass/volume. When the provider's own
 * QUANTITY / unit fields disagree with what's parseable from the item text, the
 * provider fields win (they're structured).
 */

import { receiptUnitToPantry } from './unitMap';
import { QuantityUnit } from '@/types';

export interface ParsedReceiptQuantity {
  quantity?: number;
  unit?: QuantityUnit;
  /** True when SmartPrep could not confidently determine quantity and/or unit. */
  needsReview: boolean;
  /**
   *  'weight'          - a weight/volume amount + supported unit was read (confident)
   *  'count'           - a whole-number count -> N items (confident)
   *  'unit_unresolved' - an amount was read but its unit isn't supported
   *  'quantity_missing'- nothing usable; defaulted to 1 item
   */
  reason?: 'weight' | 'count' | 'unit_unresolved' | 'quantity_missing';
}

const WEIGHT_IN_TEXT = /(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|kgs|g|gram|grams|ml|l|liter|liters)\b/i;
// A number followed by a 2-6 letter measurement-looking token (avoids matching
// a trailing "1.28 F" tax flag, which is a single letter).
const NUM_PLUS_TOKEN = /(\d+(?:\.\d+)?)\s*([a-zA-Z]{2,6})\b/;
const AT_PRICE = /(\d+(?:\.\d+)?)\s*@\s*\$?\d+(?:\.\d{2})/; // "2 @ 3.99"
const LEADING_COUNT = /^\s*(\d{1,3})\s+(?:x\s+)?[a-z]/i; // "2 MILK", "3 x BREAD"

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/[$,]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * @param itemText   the OCR item text (or raw line)
 * @param qtyField   the provider's structured QUANTITY value, if any
 * @param unitField  a provider unit token, if any
 */
export function parseReceiptQuantity(
  itemText: string,
  qtyField?: number | string | null,
  unitField?: string | null,
): ParsedReceiptQuantity {
  const providerQty = num(qtyField);
  const providerUnit = receiptUnitToPantry(unitField);

  // 1. A weight/volume amount in the item text is the strongest signal.
  const text0 = String(itemText ?? '');
  const w = text0.match(WEIGHT_IN_TEXT) ?? text0.match(NUM_PLUS_TOKEN);
  if (w) {
    const unit = receiptUnitToPantry(w[2]);
    const quantity = num(w[1]);
    if (unit && quantity != null) return { quantity, unit, needsReview: false, reason: 'weight' };
    // amount present but unit unsupported -> keep the number, send to review
    if (quantity != null) return { quantity, unit: undefined, needsReview: true, reason: 'unit_unresolved' };
  }

  // 2. Provider structured quantity + a supported unit.
  if (providerQty != null && providerUnit) {
    return { quantity: providerQty, unit: providerUnit, needsReview: false, reason: 'weight' };
  }

  // 3. "N @ price" or a provider quantity with no unit -> N packages/items.
  const text = String(itemText ?? '');
  const at = text.match(AT_PRICE);
  const leading = text.match(LEADING_COUNT);
  const countFromText = at ? num(at[1]) : leading ? num(leading[1]) : undefined;
  const count = providerQty ?? countFromText;
  if (count != null) {
    // A whole number reads as units; a non-integer with no unit is ambiguous.
    if (Number.isInteger(count)) return { quantity: count, unit: 'item', needsReview: false, reason: 'count' };
    return { quantity: count, unit: undefined, needsReview: true, reason: 'unit_unresolved' };
  }

  // 4. No amount at all -> default to one unit, flagged for review.
  return { quantity: 1, unit: 'item', needsReview: true, reason: 'quantity_missing' };
}
