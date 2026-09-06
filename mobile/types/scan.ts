import { IngredientCategory, QuantityUnit } from './common';
import { FreshnessState } from './freshness';

export type ScanMode = 'quick' | 'guided';
export type ScanSection = 'quick' | 'fridge' | 'freezer' | 'pantry';
export type ScanStatus = 'capturing' | 'processing' | 'reviewing' | 'confirmed';

/**
 * Why a vision detection is flagged for mandatory Review attention.
 *  - low_identity_confidence : the model is unsure this is the named ingredient (non-blocking)
 *  - quantity_missing        : the model could not see a quantity at all (blocking)
 *  - quantity_uncertain      : a quantity was guessed with low confidence (blocking)
 *  - unit_needs_selection    : the model's unit is not one the pantry can store (blocking)
 */
export type ScanReviewReason =
  | 'low_identity_confidence'
  | 'quantity_missing'
  | 'quantity_uncertain'
  | 'unit_needs_selection';

/** A captured photo prepared for the vision Edge Function. Never persisted. */
export interface ScanCaptureImage {
  base64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface BoundingBox {
  /** All values normalized 0-1 relative to the source image. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuantityEstimate {
  value: number;
  unit: QuantityUnit;
  /** 0-1 model confidence in the estimated quantity. */
  confidence: number;
  /** True when confidence is too low to assert a number - UI should ask the user instead. */
  isLowConfidence: boolean;
}

export interface ScanDetection {
  id: string;
  ingredientId: string;
  name: string;
  imageUri: string;
  category: IngredientCategory;
  boundingBox: BoundingBox;
  /** 0-1 confidence that this ingredient was correctly identified. */
  detectionConfidence: number;
  quantity: QuantityEstimate;
  freshness: FreshnessState;
  isUserAdded?: boolean;
  isRemoved?: boolean;
  /** True once the user has edited/confirmed the AI's proposed quantity. */
  isQuantityEdited?: boolean;
  /** True once the user has confirmed or edited the AI's proposed freshness. */
  isFreshnessEdited?: boolean;

  // --- Phase 5 (real vision) ---
  /** A short human-readable model note, e.g. "Package size not visible". */
  notes?: string;
  /** Set by deterministic post-processing when this detection must not persist without user attention. */
  needsReview?: boolean;
  reviewReasons?: ScanReviewReason[];
}

export interface ScanSectionResult {
  section: ScanSection;
  imageUri: string;
  detections: ScanDetection[];
  skipped: boolean;
}

export interface Scan {
  id: string;
  mode: ScanMode;
  status: ScanStatus;
  createdAt: string;
  sections: ScanSectionResult[];
}

export interface ScanConfirmSummary {
  ingredientsAdded: number;
  needsAttentionCount: number;
  quantityCorrectedCount: number;
  mealsPossibleEstimate: number;
}

// ---------------------------------------------------------------------------
// Phase 6 - durable Scan History (the `scans` / `scan_sections` /
// `scan_detections` tables). These are the CONFIRMED, structured result of a
// scan - never the source photo, which stays transient.
// ---------------------------------------------------------------------------

export type PersistedScanStatus = 'confirming' | 'confirmed';
/** The three guided areas; quick scans have no sections. */
export type GuidedScanSection = Exclude<ScanSection, 'quick'>;

export interface ScanRecordSection {
  section: GuidedScanSection;
  skipped: boolean;
}

export interface ScanRecordDetection {
  detectionId: string;
  section: GuidedScanSection | null;
  name: string;
  canonicalIngredientId: string | null;
  quantity: number;
  unit: QuantityUnit;
  category: IngredientCategory | null;
  identityEdited: boolean;
  quantityEdited: boolean;
  /** The pantry item this confirmed detection created; null while still pending. */
  pantryItemId: string | null;
}

/** A row in the Scan History list. */
export interface ScanRecord {
  id: string;
  clientScanId: string;
  mode: ScanMode;
  status: PersistedScanStatus;
  startedAt: string;
  confirmedAt: string | null;
  createdAt: string;
  /** Guided scans only; empty for quick scans. */
  sections: ScanRecordSection[];
  /** Detections that produced a pantry item. */
  confirmedItemCount: number;
  detectionCount: number;
  /** First few confirmed ingredient names, for a no-photo list preview. */
  ingredientPreview: string[];
}

export interface ScanRecordDetail extends ScanRecord {
  detections: ScanRecordDetection[];
}
