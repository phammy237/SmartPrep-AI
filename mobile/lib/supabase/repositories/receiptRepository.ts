import { ReceiptOcrResult } from '@/types';
import { Database, Json } from '@/types/database.types';
import { supabase } from '../client';

type ReceiptScanRow = Database['public']['Tables']['receipt_scans']['Row'];

// --- receipt-ocr Edge Function ------------------------------------------------

export interface ReceiptImagePayload {
  base64: string;
  mimeType: string;
}

export type ReceiptOcrCallResult =
  | { status: 'ok' | 'no_line_items'; result: ReceiptOcrResult }
  | {
      status:
        | 'invalid_image'
        | 'image_too_large'
        | 'rate_limited'
        | 'upstream_error'
        | 'malformed_upstream'
        | 'config_error'
        | 'unauthenticated'
        | 'auth_error';
    };

/** Run receipt OCR via the Edge Function (AWS credentials never reach the client). Never mutates the pantry. */
export async function invokeReceiptOcr(image: ReceiptImagePayload): Promise<ReceiptOcrCallResult> {
  const { data, error } = await supabase.functions.invoke('receipt-ocr', { body: { image } });
  if (error) throw error;
  return data as ReceiptOcrCallResult;
}

// --- receipt session RPCs ---------------------------------------------------

export interface ReceiptReviewItemInput {
  candidate_id: string;
  raw_text: string;
  display_name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  ocr_confidence: number | null;
}

export interface BeginReceiptReviewInput {
  clientReceiptId: string;
  ocrSource?: string;
  merchantName?: string;
  purchasedAt?: string;
  lineCount?: number;
  items: ReceiptReviewItemInput[];
}

export interface ReceiptReviewState {
  receiptScanId: string;
  status: ReceiptScanRow['status'];
  items: { candidateId: string; pantryItemId: string | null; candidateStatus: string }[];
}

export async function beginReceiptReview(input: BeginReceiptReviewInput): Promise<ReceiptReviewState> {
  const { data, error } = await supabase.rpc('begin_receipt_review', {
    p_client_receipt_id: input.clientReceiptId,
    p_ocr_source: input.ocrSource ?? 'aws_textract',
    p_merchant_name: input.merchantName ?? null,
    p_purchased_at: input.purchasedAt ?? null,
    p_line_count: input.lineCount ?? input.items.length,
    p_items: input.items as unknown as Json,
  });
  if (error) throw error;
  const raw = data as { receiptScanId: string; status: ReceiptScanRow['status']; items: { candidateId: string; pantryItemId: string | null; candidateStatus: string }[] };
  return { receiptScanId: raw.receiptScanId, status: raw.status, items: raw.items ?? [] };
}

export async function linkReceiptScanItem(
  receiptScanId: string,
  candidateId: string,
  pantryItemId: string,
): Promise<void> {
  const { error } = await supabase.rpc('link_receipt_scan_item', {
    p_receipt_scan_id: receiptScanId,
    p_candidate_id: candidateId,
    p_pantry_item_id: pantryItemId,
  });
  if (error) throw error;
}

export interface ReceiptSessionSummary {
  id: string;
  status: ReceiptScanRow['status'];
  itemCount: number;
}

export async function finalizeReceiptReview(
  receiptScanId: string,
  skippedCandidateIds: string[] = [],
): Promise<ReceiptSessionSummary> {
  const { data, error } = await supabase.rpc('finalize_receipt_review', {
    p_receipt_scan_id: receiptScanId,
    p_skipped_candidate_ids: skippedCandidateIds,
  });
  if (error) throw error;
  const row = data as ReceiptScanRow;
  return { id: row.id, status: row.status, itemCount: row.item_count };
}
