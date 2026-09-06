import { QuantityUnit } from '@/types';

/**
 * Every deterministic number that shapes Scan Review UX lives here - screens
 * and the mapping layer import from this module, never hardcode their own.
 */

/**
 * Identity confidence < this is treated as noise and the detection is dropped
 * (not shown). Kept conservative so genuinely-useful low-confidence guesses
 * still reach Review flagged, rather than being silently discarded.
 */
export const SCAN_IDENTITY_NOISE_THRESHOLD = 0.3;

/** Identity confidence < this flags the detection `low_identity_confidence` (non-blocking - the user may still accept it). */
export const SCAN_IDENTITY_REVIEW_THRESHOLD = 0.7;

/** quantityConfidence < this flags `quantity_uncertain` (blocking - the user must confirm/correct before persisting). */
export const SCAN_QUANTITY_REVIEW_THRESHOLD = 0.6;

/** Units the pantry DB (`pantry_items.unit` CHECK) can actually store. A model unit outside this set forces `unit_needs_selection`. */
export const PERSISTABLE_SCAN_UNITS: readonly QuantityUnit[] = [
  'item',
  'container',
  'bag',
  'bottle',
  'can',
  'package',
  'serving',
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'L',
];

export function isPersistableScanUnit(unit: string): unit is QuantityUnit {
  return (PERSISTABLE_SCAN_UNITS as readonly string[]).includes(unit);
}

/** Reasons that BLOCK confirming a scan until the user resolves them (identity is not blocking). */
export const BLOCKING_REVIEW_REASONS = ['quantity_missing', 'quantity_uncertain', 'unit_needs_selection'] as const;

/**
 * Largest base64 payload the client will send to the vision function. ~2.7M
 * base64 chars ≈ ~2 MB of JPEG - enough for label/ingredient recognition at
 * the capture quality below, small enough to avoid multi-megabyte requests.
 */
export const MAX_SCAN_IMAGE_BASE64_CHARS = 2_700_000;

/** JPEG quality passed to `takePictureAsync`. Low enough to keep requests small; high enough to read package text. */
export const SCAN_CAPTURE_JPEG_QUALITY = 0.4;
