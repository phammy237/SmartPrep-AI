import {
  BarcodeLookupDeps,
  BarcodeLookupResult,
  normalizeBarcode,
  lookupProduct,
} from '@/lib/barcode';
import { supabase } from '@/lib/supabase/client';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not signed in');
  }
  return data.user.id;
}

/**
 * Normalize -> validate -> look up a barcode. The camera path and the manual
 * text-entry path both call exactly this. Performs NO pantry mutation - the
 * result feeds the review screen, and only "Add to pantry" there writes
 * inventory.
 *
 * @param opts.upcE  the camera reported a UPC-E symbol (lets us expand it unambiguously)
 */
async function lookupBarcode(
  rawBarcode: string,
  opts: { upcE?: boolean; deps?: BarcodeLookupDeps } = {},
): Promise<BarcodeLookupResult> {
  await requireUserId();

  const normalized = normalizeBarcode(rawBarcode, { upcE: opts.upcE });
  if (!normalized.ok) {
    return { status: 'error', reason: 'invalid_barcode', barcode: rawBarcode.trim() };
  }

  return lookupProduct(normalized.barcode.value, opts.deps);
}

export const barcodeService = {
  lookupBarcode,
};
