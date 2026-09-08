/**
 * Provider-neutral Receipt OCR contract. Raw AWS Textract (or any future
 * provider) shapes stop inside the `receipt-ocr` Edge Function's adapter -
 * screens and services only ever see these types.
 *
 * Keep in sync BY HAND with `supabase/functions/receipt-ocr/normalize.ts`
 * (Deno can't import app modules). This is small and stable.
 */

export type ReceiptOcrSource = 'aws_textract';

export interface ReceiptRawLine {
  /** Stable within one OCR result (line index). */
  id: string;
  /** Best available full-line text (the EXPENSE_ROW value, else the ITEM value). Evidence - never mutated downstream. */
  rawText: string;
  /** The provider's ITEM field value, when it structured one. */
  itemText?: string;
  quantity?: number;
  unitText?: string;
  unitPrice?: number;
  lineTotal?: number;
  /** Retailer product code / SKU / PLU the provider surfaced. NOT assumed to be a global UPC/EAN. */
  productCode?: string;
  /** 0-100, provider's confidence for the item field (or the row). */
  confidence?: number;
  /** True when the provider explicitly tagged this as a line ITEM (vs. only an EXPENSE_ROW). */
  providerMarkedItem: boolean;
}

export interface ReceiptOcrResult {
  source: ReceiptOcrSource;
  merchantName?: string;
  /** ISO YYYY-MM-DD when the provider gave a parseable date. */
  receiptDate?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  lines: ReceiptRawLine[];
}

// --- app-side, post-normalization -----------------------------------------

export type ReceiptCandidateStatus = 'ready' | 'needs_review' | 'ignored';
export type ReceiptConfidenceBucket = 'high' | 'check' | 'low';

export interface ReceiptIntakeCandidate {
  /** Stable per receipt session - the pantry-creation idempotency key. */
  candidateId: string;
  /** The untouched OCR line text. Never overwritten by SmartPrep's interpretation. */
  rawText: string;
  /** SmartPrep's interpreted, user-editable product name (conservatively normalized from rawText). */
  displayName: string;
  quantity?: number;
  unit?: import('./common').QuantityUnit;
  category: import('./common').IngredientCategory;
  /** Review context only (unit price or line total). Not persisted anywhere. */
  price?: number;
  selected: boolean;
  confidence: ReceiptConfidenceBucket;
  status: ReceiptCandidateStatus;
  /** Exact canonical match on the (possibly user-corrected) name, else undefined. Never fuzzy. */
  canonicalIngredientId?: string;
  /** The `ReceiptRawLine.id` this came from. */
  sourceLineId: string;
  /** Why the line still needs a look (missing qty/unit, low OCR confidence, ...). */
  reviewReasons: ReceiptReviewReason[];
}

export type ReceiptReviewReason =
  | 'low_ocr_confidence'
  | 'quantity_missing'
  | 'unit_unresolved'
  | 'ambiguous_line'
  | 'identity_unresolved';
