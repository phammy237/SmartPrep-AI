import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { scanService } from '@/services';
import { useScanSessionStore } from '@/store';
import { Scan, ScanCaptureImage, ScanMode, ScanSection } from '@/types';
import { queryKeys } from './queryKeys';

/** Confirmed scans, newest first (real Supabase-backed history). */
export function useScanHistory() {
  return useQuery({ queryKey: queryKeys.scanHistory, queryFn: scanService.getScanHistory });
}

/** One confirmed scan with its full confirmed-detection list. */
export function useScanDetail(scanId: string) {
  return useQuery({
    queryKey: queryKeys.scanDetail(scanId),
    queryFn: () => scanService.getScanDetail(scanId),
    enabled: !!scanId,
  });
}

/**
 * Runs REAL vision inference (Edge Function -> vision model) for a captured
 * photo and writes the resulting detections into the scan session. On failure
 * the mutation rejects with a `ScanInferenceError`; there is no canned
 * fallback - the Processing screen shows an honest retry / manual-entry path.
 */
export function useProcessCapture() {
  const setSectionResult = useScanSessionStore((s) => s.setSectionResult);
  return useMutation({
    mutationFn: ({
      mode,
      section,
      image,
      previewUri,
    }: {
      mode: ScanMode;
      section: ScanSection;
      image: ScanCaptureImage;
      previewUri: string;
    }) => scanService.processCapture(mode, section, image, previewUri),
    onSuccess: (result) => setSectionResult(result),
  });
}

/** Commits the reviewed scan session to the pantry and scan history. */
export function useConfirmScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scan: Scan) => scanService.confirmScan(scan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      queryClient.invalidateQueries({ queryKey: queryKeys.recipeCollections });
      queryClient.invalidateQueries({ queryKey: queryKeys.readyToCookCount });
      queryClient.invalidateQueries({ queryKey: queryKeys.scanHistory });
    },
  });
}
