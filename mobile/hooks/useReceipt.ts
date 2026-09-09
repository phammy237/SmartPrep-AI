import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ReceiptImagePayload } from '@/lib/supabase/repositories';
import { ConfirmReceiptItemInput } from '@/lib/validation/receiptSchemas';
import { pantryService, receiptService } from '@/services';
import { BeginReceiptReviewArgs } from '@/services/receiptService';
import { haptics } from '@/utils/haptics';
import { invalidatePantryDerivedQueries } from './invalidatePantryDerived';
import { useUser } from './useUser';

function useTimeZone(): string {
  return useUser().data?.timezone ?? 'UTC';
}

/** One OCR call per receipt photo. Rejects only on auth; every provider outcome is a status. Never writes inventory. */
export function useProcessReceipt() {
  return useMutation({
    mutationFn: (image: ReceiptImagePayload) => receiptService.processReceipt(image),
  });
}

/** Persist the durable review session (idempotent per clientReceiptId). */
export function useBeginReceiptReview() {
  return useMutation({
    mutationFn: (args: BeginReceiptReviewArgs) => receiptService.beginReview(args),
  });
}

/**
 * Confirm the reviewed batch. Each candidate is created independently and
 * idempotently; retry only re-attempts what failed. Returns { created, failed }.
 */
export function useConfirmReceiptItems() {
  const queryClient = useQueryClient();
  const timeZone = useTimeZone();
  return useMutation({
    mutationFn: (args: { receiptScanId: string; items: ConfirmReceiptItemInput[]; skippedCandidateIds: string[] }) =>
      pantryService.createReceiptItemsToPantry(args.receiptScanId, args.items, args.skippedCandidateIds, timeZone),
    onSuccess: (result) => {
      if (result.created.length > 0) {
        haptics.success();
        invalidatePantryDerivedQueries(queryClient);
      }
    },
  });
}
