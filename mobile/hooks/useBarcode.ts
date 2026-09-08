import { useMutation, useQueryClient } from '@tanstack/react-query';

import { BarcodeLookupDeps } from '@/lib/barcode';
import { CreateBarcodeItemInput } from '@/lib/validation/barcodeSchemas';
import { EnrichBarcodeProductArgs, barcodeService, nutritionService, pantryService } from '@/services';
import { haptics } from '@/utils/haptics';
import { queryKeys } from './queryKeys';
import { useUser } from './useUser';

/** Same timezone-resolution pattern as usePantry - UTC until the profile loads. */
function useTimeZone(): string {
  return useUser().data?.timezone ?? 'UTC';
}

/**
 * Normalize -> validate -> look up a barcode. Used by BOTH the camera scanner
 * and the manual text-entry field - one pipeline, no second implementation.
 * Rejects only on auth; every product/provider outcome comes back as a
 * `BarcodeLookupResult` for the screen to branch on.
 */
export function useBarcodeLookup() {
  return useMutation({
    mutationFn: (args: { barcode: string; upcE?: boolean; deps?: BarcodeLookupDeps }) =>
      barcodeService.lookupBarcode(args.barcode, { upcE: args.upcE, deps: args.deps }),
  });
}

/**
 * One-shot barcode-intake nutrition enrichment, fired once from the review
 * screen: persists the Open Food Facts candidate and attempts an exact USDA
 * branded-GTIN verification (server-side). Never rejects for a provider outcome
 * - a USDA failure just leaves the OFF candidate in place.
 */
export function useEnrichBarcodeProductNutrition() {
  return useMutation({
    mutationFn: (args: EnrichBarcodeProductArgs) => nutritionService.enrichBarcodeProductNutrition(args),
  });
}

/** Confirmed server result only - the reviewed barcode item goes through create_pantry_item. */
export function useCreateBarcodeItem() {
  const queryClient = useQueryClient();
  const timeZone = useTimeZone();
  return useMutation({
    mutationFn: (input: CreateBarcodeItemInput) => pantryService.createBarcodeItem(input, timeZone),
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipeCollections });
      queryClient.invalidateQueries({ queryKey: queryKeys.readyToCookCount });
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations });
    },
  });
}
