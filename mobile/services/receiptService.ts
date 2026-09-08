import { ocrResultToCandidates } from '@/lib/receipt';
import {
  BeginReceiptReviewInput,
  ReceiptImagePayload,
  ReceiptReviewState,
  beginReceiptReview,
  invokeReceiptOcr,
} from '@/lib/supabase/repositories';
import { ReceiptIntakeCandidate, ReceiptOcrResult } from '@/types';
import { requireUserId } from './requireUserId';

export type ReceiptProcessResult =
  | { status: 'ok'; ocr: ReceiptOcrResult; candidates: ReceiptIntakeCandidate[] }
  | { status: 'no_line_items'; ocr: ReceiptOcrResult; candidates: [] }
  | {
      status:
        | 'invalid_image'
        | 'image_too_large'
        | 'rate_limited'
        | 'upstream_error'
        | 'malformed_upstream'
        | 'config_error'
        | 'auth_error';
    };

/**
 * OCR a receipt photo and turn it into reviewable candidates. NEVER writes to
 * the pantry or any table - OCR is an intake assistant. Idempotent: calling it
 * again just re-runs OCR (the durable session is only created when the user
 * reaches the review screen, via `beginReview`).
 */
async function processReceipt(image: ReceiptImagePayload): Promise<ReceiptProcessResult> {
  await requireUserId();
  const call = await invokeReceiptOcr(image);

  if (call.status === 'ok') {
    return { status: 'ok', ocr: call.result, candidates: ocrResultToCandidates(call.result) };
  }
  if (call.status === 'no_line_items') {
    return { status: 'no_line_items', ocr: call.result, candidates: [] };
  }
  if (call.status === 'unauthenticated') {
    throw new Error('Not signed in');
  }
  return { status: call.status };
}

export interface BeginReceiptReviewArgs {
  clientReceiptId: string;
  ocr: ReceiptOcrResult;
  candidates: ReceiptIntakeCandidate[];
}

/**
 * Persist the durable receipt session + its reviewable candidate rows (names,
 * quantities, units, confidence - never a price, never the image). Idempotent
 * per `clientReceiptId`; a candidate already linked to a pantry item is frozen.
 */
async function beginReview(args: BeginReceiptReviewArgs): Promise<ReceiptReviewState> {
  await requireUserId();
  const input: BeginReceiptReviewInput = {
    clientReceiptId: args.clientReceiptId,
    ocrSource: args.ocr.source,
    merchantName: args.ocr.merchantName,
    purchasedAt: args.ocr.receiptDate,
    lineCount: args.ocr.lines.length,
    items: args.candidates.map((c) => ({
      candidate_id: c.candidateId,
      raw_text: c.rawText.slice(0, 300),
      display_name: c.displayName,
      quantity: c.quantity ?? null,
      unit: c.unit ?? null,
      category: c.category ?? null,
      ocr_confidence: null,
    })),
  };
  return beginReceiptReview(input);
}

export const receiptService = {
  processReceipt,
  beginReview,
};
