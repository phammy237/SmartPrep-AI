/**
 * Deterministic receipt-unit -> SmartPrep pantry unit mapping. Only the units a
 * grocery receipt reliably prints. Anything else -> undefined (left for review,
 * never fabricated).
 */

import { normalizeUnit } from '@/lib/nutrition/units';
import { QuantityUnit } from '@/types';

const PANTRY_UNITS: ReadonlySet<string> = new Set([
  'item', 'container', 'bag', 'bottle', 'can', 'package', 'serving', 'g', 'kg', 'oz', 'lb', 'ml', 'L',
]);

/** `EA`, `EACH`, `CT`, `PC`, `PK` -> item (a receipt count). */
const COUNT_TOKENS = new Set(['ea', 'each', 'ct', 'count', 'pc', 'pcs', 'piece', 'pieces', 'pk', 'pack']);

export function receiptUnitToPantry(token: string | undefined | null): QuantityUnit | undefined {
  if (!token) return undefined;
  const t = String(token).trim().toLowerCase().replace(/[.]/g, '');
  if (t.length === 0) return undefined;
  if (COUNT_TOKENS.has(t)) return 'item';

  const key = normalizeUnit(t);
  if (!key) return undefined;
  const mapped = key === 'l' ? 'L' : key;
  return PANTRY_UNITS.has(mapped) ? (mapped as QuantityUnit) : undefined;
}
