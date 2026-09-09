import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './queryKeys';

/**
 * Every cache surface whose contents are derived from the pantry: recipe
 * coverage, the collection buckets, the "ready to cook" count, and the
 * Use-Soon recommendations (which rank on pantry expiry + coverage).
 *
 * Any mutation that adds, removes, or changes a pantry lot - manual add,
 * barcode/receipt/photo intake, grocery-to-pantry transfer, cooking
 * deductions - must invalidate all of these together, or one screen updates
 * while the next still shows stale numbers (see the grocery-transfer bug this
 * consolidated).
 */
export const PANTRY_DERIVED_QUERY_KEYS = [
  queryKeys.pantry,
  queryKeys.recipes,
  queryKeys.recipeCollections,
  queryKeys.readyToCookCount,
  queryKeys.recommendations,
] as const;

/** Invalidate every pantry-derived cache surface in one call. */
export function invalidatePantryDerivedQueries(queryClient: QueryClient): void {
  for (const queryKey of PANTRY_DERIVED_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey });
  }
}
