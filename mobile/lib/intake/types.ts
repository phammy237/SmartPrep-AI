/**
 * Provider-neutral pantry-intake candidate. Barcode intake and Receipt OCR both
 * map their provider-specific detection into this shape; the shared
 * `prepareIntakeCreateInput` turns it into the exact argument `create_pantry_item`
 * wants. Fields only one source has (a barcode, an OCR raw line) live under a
 * discriminated `provenance`, never forced onto the other.
 */

import { IngredientCategory, QuantityUnit, UserProvidedDateType } from '@/types';

/** Common, reviewed pantry semantics every intake path shares. */
export interface IntakeCandidateCore {
  /** User-facing / user-editable product name. Distinct from any raw evidence. */
  displayName: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  storageLocation?: import('@/types').StorageLocation;
  notes?: string;
  /** Pre-fills the estimated-expiry heuristic (never the expiry itself). */
  purchaseDate?: string;
  /** A printed best-by/use-by the user entered. Drives `expirationConfidence: 'high'`. */
  userProvidedDate?: string;
  userProvidedDateType?: UserProvidedDateType;
}

export interface BarcodeIntakeProvenance {
  provenance: 'barcode';
  /** Normalized UPC/EAN. */
  barcode: string;
  brand?: string;
  /** Only when an EXACT USDA branded-food GTIN match was persisted during review. */
  fdcId?: string;
  /** Provider image URL (https only) used as the pantry image when identity is non-canonical. */
  imageUrl?: string;
}

export interface ReceiptIntakeProvenance {
  provenance: 'receipt';
  /** The persisted `receipt_scans.id` this candidate belongs to. */
  receiptScanId: string;
  /** Stable per-session candidate id - the idempotency key for this line's pantry creation. */
  candidateId: string;
  /** The untouched OCR line text (evidence). Not persisted to `pantry_items`. */
  rawText: string;
}

export type IntakeCandidate = IntakeCandidateCore & (BarcodeIntakeProvenance | ReceiptIntakeProvenance);

/** Exactly what the `createPantryItem` repository call expects, from any intake source. */
export interface PreparedIntakeCreateInput {
  ingredientId: string;
  imageUri: string;
  displayName: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  storageLocation?: import('@/types').StorageLocation;
  notes?: string;
  purchaseDate?: string;
  userProvidedDate?: string;
  userProvidedDateType?: UserProvidedDateType;
  estimatedExpirationDate?: string;
  expirationConfidence: 'high' | 'medium' | 'low' | 'unknown';
  source: 'barcode' | 'receipt';
  barcode?: string;
  brand?: string;
  fdcId?: string;
  sourceReceiptCandidateId?: string;
  sourceReceiptId?: string;
  /** True when `displayName` resolved to a real catalog ingredient. */
  canonicalIdentity: boolean;
}
