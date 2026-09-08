/**
 * The ONE place a pantry item gets its canonical identity, shared by every
 * intake path (manual add, Vision Scan, Barcode, Receipt OCR). Exact-only
 * catalog resolution - id, then normalized name / authored alias - NEVER fuzzy.
 * When it resolves, downstream quantity coverage + nutrition work by canonical
 * id; when it doesn't, the item still persists with a synthetic id so nothing
 * is ever blocked.
 */

import { INGREDIENTS_BY_ID, resolveCanonicalIngredient } from '@/data';
import { generateId } from '@/utils/id';

export interface ResolvedPantryIdentity {
  /** Canonical catalog id when one resolves exactly; otherwise the hint or a fresh synthetic id. */
  ingredientId: string;
  imageUri: string;
  /** True when the display name / hint resolved to a real catalog ingredient. */
  canonical: boolean;
}

export interface ResolvePantryIdentityOptions {
  /** A candidate catalog id (barcode: a synthetic `ing-barcode-*`; scan: the model's guess). Tried first, then as an alias. */
  hintId?: string;
  /** The user-facing display name (possibly a corrected receipt abbreviation, a branded product name, etc.). */
  name: string;
  /** Image to use when nothing resolves canonically. */
  fallbackImageUri: string;
  /** Prefix for the synthetic id when nothing resolves. Defaults to `ing-manual`. */
  syntheticPrefix?: string;
}

export function resolvePantryIdentity(opts: ResolvePantryIdentityOptions): ResolvedPantryIdentity {
  const catalog =
    (opts.hintId ? INGREDIENTS_BY_ID[opts.hintId] : undefined) ??
    (opts.hintId ? resolveCanonicalIngredient(opts.hintId) : null) ??
    resolveCanonicalIngredient(opts.name);
  if (catalog) {
    return { ingredientId: catalog.id, imageUri: catalog.imageUri, canonical: true };
  }
  return {
    ingredientId: opts.hintId ?? generateId(opts.syntheticPrefix ?? 'ing-manual'),
    imageUri: opts.fallbackImageUri,
    canonical: false,
  };
}
