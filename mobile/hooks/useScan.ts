import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { scanService } from '@/services';
import { useScanSessionStore } from '@/store';
import { Scan, ScanMode, ScanSection } from '@/types';
import { queryKeys } from './queryKeys';

export function useScanHistory() {
  return useQuery({ queryKey: queryKeys.scanHistory, queryFn: scanService.getScanHistory });
}

/** Runs the mock AI processing step and writes the resulting detections into the scan session. */
export function useProcessCapture() {
  const setSectionResult = useScanSessionStore((s) => s.setSectionResult);
  return useMutation({
    mutationFn: ({ mode, section, imageUri }: { mode: ScanMode; section: ScanSection; imageUri: string }) =>
      scanService.processCapture(mode, section, imageUri),
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
