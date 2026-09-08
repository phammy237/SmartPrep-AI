/**
 * The single barcode->product gateway. Screens and `barcodeService` call
 * `lookupProduct`; provider URLs / payload shapes never leave this file (and
 * its `openFoodFacts` adapter).
 *
 * No Supabase Edge Function is used: Open Food Facts needs no secret and is
 * reachable directly from the device, so an Edge Function would only add a
 * deploy dependency for no security benefit. If a keyed provider is added
 * later, this is the seam where an Edge Function call would slot in.
 */

import { lookupVariants } from './normalize';
import { OffFetchDeps, fetchOpenFoodFactsProduct } from './openFoodFacts';
import { BarcodeLookupResult } from './types';

export type BarcodeLookupDeps = OffFetchDeps;

/**
 * Resolve a NORMALIZED barcode string to a product. Tries the canonical value,
 * then (for a 12-digit UPC-A) the zero-padded 13-digit GTIN, since product
 * databases frequently store the padded form. Deterministic: the first hit
 * wins, provenance keeps the originally-scanned barcode, and provider results
 * are never merged.
 */
export async function lookupProduct(
  normalizedBarcode: string,
  deps: BarcodeLookupDeps = {},
): Promise<BarcodeLookupResult> {
  const variants = lookupVariants(normalizedBarcode);
  let lastResult: BarcodeLookupResult = { status: 'not_found', barcode: normalizedBarcode };

  for (const key of variants) {
    const result = await fetchOpenFoodFactsProduct(normalizedBarcode, key, deps);
    if (result.status === 'found') return result;
    // A hard error should surface immediately rather than being masked by a
    // "not found" from a later variant.
    if (result.status === 'error') return result;
    lastResult = result;
  }
  return lastResult;
}
