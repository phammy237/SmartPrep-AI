import { INGREDIENTS_BY_ID, resolveCanonicalIngredient } from '@/data';
import { normalizeUnit } from '@/lib/nutrition/units';
import {
  BLOCKING_REVIEW_REASONS,
  SCAN_IDENTITY_NOISE_THRESHOLD,
  SCAN_IDENTITY_REVIEW_THRESHOLD,
  SCAN_QUANTITY_REVIEW_THRESHOLD,
  isPersistableScanUnit,
} from '@/lib/scan/thresholds';
import {
  ScanInferenceError,
  beginScanConfirmation,
  detectScanIngredients,
  fetchConfirmedScans,
  fetchScanDetail,
  finalizeScanConfirmation,
  linkScanDetection,
} from '@/lib/supabase/repositories';
import { VisionDetection } from '@/lib/validation/scanSchemas';
import {
  FreshnessState,
  GuidedScanSection,
  QuantityUnit,
  Scan,
  ScanCaptureImage,
  ScanConfirmSummary,
  ScanDetection,
  ScanMode,
  ScanRecord,
  ScanRecordDetail,
  ScanReviewReason,
  ScanSection,
  ScanSectionResult,
} from '@/types';
import { generateId } from '@/utils/id';
import { placeholderPhotoUri } from '@/utils/ingredientPhoto';
import { gridBoxes } from '@/utils/scanBoxes';
import { pantryService } from './pantryService';
import { recipeService } from './recipeService';
import { requireUserId } from './requireUserId';

export { ScanInferenceError };

/** Thrown by confirmScan when a detection still needs the user's attention (uncertain quantity / unit). */
export class ScanReviewIncompleteError extends Error {
  constructor(readonly detectionNames: string[]) {
    super(
      detectionNames.length === 1
        ? `"${detectionNames[0]}" still needs a quantity or unit before it can be saved.`
        : `${detectionNames.length} items still need a quantity or unit before they can be saved.`,
    );
    this.name = 'ScanReviewIncompleteError';
  }
}

/** Vision doesn't assess freshness; every scanned item starts "Can't Tell" and the user can set it in Review. */
const NEUTRAL_FRESHNESS: FreshnessState = { score: 50, confidence: 0, label: 'cant_tell' };

function startScan(mode: ScanMode): Scan {
  return { id: generateId('scan'), mode, status: 'capturing', createdAt: new Date().toISOString(), sections: [] };
}

function skippedSection(section: ScanSection): ScanSectionResult {
  return { section, imageUri: '', detections: [], skipped: true };
}

/**
 * Turns one validated vision detection into a Review-ready `ScanDetection`:
 *  - canonical identity via the shared exact-only resolver (no fuzzy/AI matching here)
 *  - unit normalized through the Phase-4 taxonomy; a non-persistable unit is
 *    NOT guessed - it's flagged `unit_needs_selection`
 *  - a missing / low-confidence quantity is flagged (blocking) rather than fabricated
 *  - a low-confidence identity is flagged (non-blocking - the user may accept it)
 */
function mapVisionDetection(v: VisionDetection, box: ScanDetection['boundingBox']): ScanDetection {
  const canonical = resolveCanonicalIngredient(v.name);
  const reviewReasons: ScanReviewReason[] = [];

  if (v.confidence < SCAN_IDENTITY_REVIEW_THRESHOLD) reviewReasons.push('low_identity_confidence');

  // Unit
  const normalized = v.unit ? normalizeUnit(v.unit) : null;
  let unit: QuantityUnit;
  if (normalized && isPersistableScanUnit(normalized)) {
    unit = normalized;
  } else {
    unit = canonical?.defaultUnit ?? 'item';
    if (v.unit) reviewReasons.push('unit_needs_selection');
  }

  // Quantity
  let quantityValue = v.quantity ?? 1;
  let isLowConfidence = false;
  if (v.quantity == null) {
    reviewReasons.push('quantity_missing');
    isLowConfidence = true;
    quantityValue = 1;
  } else if ((v.quantityConfidence ?? 0) < SCAN_QUANTITY_REVIEW_THRESHOLD) {
    reviewReasons.push('quantity_uncertain');
    isLowConfidence = true;
  }
  if (reviewReasons.includes('unit_needs_selection')) isLowConfidence = true;

  const noteParts = [v.notes ?? undefined];
  if (v.unit && !(normalized && isPersistableScanUnit(normalized))) {
    noteParts.push(`Model said unit "${v.unit}".`);
  }
  const notes = noteParts.filter(Boolean).join(' ') || undefined;

  return {
    id: generateId('det'),
    ingredientId: canonical?.id ?? generateId('ing-scan'),
    name: canonical?.name ?? v.name,
    imageUri: canonical?.imageUri ?? placeholderPhotoUri(`scan-${v.name}`, 300, 300),
    category: canonical?.category ?? v.category ?? 'other',
    boundingBox: box,
    detectionConfidence: v.confidence,
    quantity: {
      value: quantityValue,
      unit,
      confidence: v.quantityConfidence ?? 0,
      isLowConfidence,
    },
    freshness: NEUTRAL_FRESHNESS,
    notes,
    needsReview: reviewReasons.length > 0,
    reviewReasons: reviewReasons.length > 0 ? reviewReasons : undefined,
  };
}

/**
 * REAL vision inference: capture -> authenticated Edge Function -> vision model
 * -> validated detections -> Review-ready `ScanDetection[]`.
 *
 * Any failure throws a `ScanInferenceError` (or bubbles a `ScanInferenceError`
 * from the repository). There is NO fallback to canned demo detections - an
 * inference failure surfaces an honest retry / manual-entry path in the UI.
 */
async function processCapture(
  mode: ScanMode,
  section: ScanSection,
  image: ScanCaptureImage,
  previewUri: string,
): Promise<ScanSectionResult> {
  await requireUserId();

  const { detections: raw } = await detectScanIngredients({ image, scanMode: mode, section });

  const usable = raw.filter((d) => d.confidence >= SCAN_IDENTITY_NOISE_THRESHOLD);
  const boxes = gridBoxes(usable.length);
  const detections = usable.map((d, i) => mapVisionDetection(d, boxes[i]));

  return { section, imageUri: previewUri, detections, skipped: false };
}

/**
 * Thrown when at least one confirmed detection could not be written to the
 * real pantry. Rows that DID persist are already in `pantry_items` - this
 * carries the partial counts rather than pretending nothing happened.
 */
export class ScanConfirmError extends Error {
  constructor(
    readonly addedCount: number,
    readonly failedCount: number,
    readonly failures: unknown[],
  ) {
    super(`Saved ${addedCount} scanned item${addedCount === 1 ? '' : 's'}; ${failedCount} could not be saved.`);
    this.name = 'ScanConfirmError';
  }
}

function unresolvedReviewNames(detections: ScanDetection[]): string[] {
  const blocking = new Set<string>(BLOCKING_REVIEW_REASONS);
  return detections
    .filter((d) => !d.isRemoved && (d.reviewReasons ?? []).some((r) => blocking.has(r)))
    .filter((d) => {
      const addressedQuantity = d.isQuantityEdited === true;
      const addressedUnit = isPersistableScanUnit(d.quantity.unit);
      const reasons = d.reviewReasons ?? [];
      const quantityBlocked = (reasons.includes('quantity_missing') || reasons.includes('quantity_uncertain')) && !addressedQuantity;
      const unitBlocked = reasons.includes('unit_needs_selection') && !addressedUnit;
      return quantityBlocked || unitBlocked;
    })
    .map((d) => d.name);
}

/** Detections (across all sections) that still block confirmation. Exposed so Review can disable Confirm. */
export function getBlockingReviewNames(scan: Scan): string[] {
  return unresolvedReviewNames(scan.sections.flatMap((s) => s.detections));
}

function detectionSectionOf(scan: Scan): Map<string, GuidedScanSection | null> {
  const map = new Map<string, GuidedScanSection | null>();
  for (const s of scan.sections) {
    for (const d of s.detections) {
      map.set(d.id, s.section === 'quick' ? null : s.section);
    }
  }
  return map;
}

/**
 * Commits the reviewed scan through a DURABLE, RESUMABLE model so a retry
 * after any partial failure never double-writes:
 *
 *  1. `begin_scan_confirmation` - one `scans` row (keyed by the stable
 *     `scan.id`, so a retry resumes it, never forks a new one) plus one
 *     intent row per confirmed detection.
 *  2. per detection - `pantryService.createScanItem` (the SAME shared path as
 *     a manual add) keyed by the detection id, so the pantry insert is
 *     idempotent even if a prior response was lost; then `link_scan_detection`
 *     records which pantry item it produced. Detections already linked on a
 *     previous attempt are skipped.
 *  3. `finalize_scan_confirmation` - flips the scan to `confirmed` once every
 *     detection is linked (idempotent; safe to retry on its own).
 *
 * Rejects up front if any detection still needs the user's attention. On a
 * pantry failure it throws `ScanConfirmError` with the partial counts and
 * leaves the scan `confirming` (resumable) - it does NOT roll back the items
 * that did persist.
 */
async function confirmScan(
  scan: Scan,
  timeZone: string = 'UTC',
): Promise<{ scan: Scan; summary: ScanConfirmSummary }> {
  await requireUserId();

  const confirmedDetections = scan.sections.flatMap((s) => s.detections).filter((d) => !d.isRemoved);

  const stillNeedsReview = unresolvedReviewNames(confirmedDetections);
  if (stillNeedsReview.length > 0) {
    throw new ScanReviewIncompleteError(stillNeedsReview);
  }
  if (confirmedDetections.length === 0) {
    // Nothing to save - don't create an empty scan record.
    throw new ScanConfirmError(0, 0, []);
  }

  const sectionOf = detectionSectionOf(scan);

  const begin = await beginScanConfirmation({
    clientScanId: scan.id,
    mode: scan.mode,
    startedAt: scan.createdAt,
    sections:
      scan.mode === 'guided'
        ? scan.sections
            .filter((s) => s.section !== 'quick')
            .map((s, i) => ({ section: s.section, skipped: s.skipped, sortOrder: i }))
        : [],
    detections: confirmedDetections.map((d) => ({
      detectionId: d.id,
      section: sectionOf.get(d.id) ?? null,
      displayName: d.name,
      // Only a real catalog hit is a canonical id; a synthetic scan id is not.
      canonicalIngredientId: INGREDIENTS_BY_ID[d.ingredientId] ? d.ingredientId : null,
      quantity: d.quantity.value,
      unit: d.quantity.unit,
      category: d.category,
      identityEdited: false,
      quantityEdited: d.isQuantityEdited === true,
    })),
  });

  const alreadyLinked = new Set(
    begin.detections.filter((d) => d.pantryItemId !== null).map((d) => d.detectionId),
  );

  const results = await Promise.allSettled(
    confirmedDetections
      .filter((d) => !alreadyLinked.has(d.id))
      .map(async (d) => {
        const item = await pantryService.createScanItem(
          {
            ingredientId: d.ingredientId,
            name: d.name,
            imageUri: d.imageUri,
            category: d.category,
            quantity: d.quantity.value,
            unit: d.quantity.unit,
            sourceScanDetectionId: d.id,
          },
          timeZone,
        );
        await linkScanDetection(begin.scanId, d.id, item.id);
      }),
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
  const addedCount = confirmedDetections.length - failures.length;
  if (failures.length > 0) {
    // Scan stays `confirming`; a retry re-attempts only the still-pending detections.
    throw new ScanConfirmError(addedCount, failures.length, failures);
  }

  await finalizeScanConfirmation(begin.scanId);

  const finalScan: Scan = { ...scan, status: 'confirmed' };
  const mealsPossibleEstimate = await recipeService.countReadyToCookRecipes();

  const summary: ScanConfirmSummary = {
    ingredientsAdded: addedCount,
    needsAttentionCount: confirmedDetections.filter(
      (d) => d.freshness.label === 'prioritize' || d.freshness.label === 'use_soon',
    ).length,
    quantityCorrectedCount: confirmedDetections.filter((d) => d.isQuantityEdited).length,
    mealsPossibleEstimate,
  };

  return { scan: finalScan, summary };
}

/** Confirmed scans for the History screen, newest first. Authenticated + RLS-scoped. */
async function getScanHistory(): Promise<ScanRecord[]> {
  await requireUserId();
  return fetchConfirmedScans();
}

/** One confirmed scan with its full detection list, or null if not found / not owned. */
async function getScanDetail(scanId: string): Promise<ScanRecordDetail | null> {
  await requireUserId();
  return fetchScanDetail(scanId);
}

export const scanService = {
  startScan,
  processCapture,
  skippedSection,
  confirmScan,
  getBlockingReviewNames,
  getScanHistory,
  getScanDetail,
};
