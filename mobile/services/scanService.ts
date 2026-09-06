import { GUIDED_SCAN_SECTIONS, QUICK_SCAN_DETECTIONS } from '@/data';
import { Scan, ScanConfirmSummary, ScanDetection, ScanMode, ScanSection, ScanSectionResult } from '@/types';
import { generateId } from '@/utils/id';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';
import { pantryService } from './pantryService';
import { recipeService } from './recipeService';
import { requireUserId } from './requireUserId';

function freshDetections(source: ScanDetection[]): ScanDetection[] {
  return clone(source).map((detection: ScanDetection) => ({ ...detection, id: generateId('det') }));
}

function startScan(mode: ScanMode): Scan {
  return {
    id: generateId('scan'),
    mode,
    status: 'capturing',
    createdAt: new Date().toISOString(),
    sections: [],
  };
}

/** Simulates the AI processing step and returns canned detections for the captured section. */
async function processCapture(
  mode: ScanMode,
  section: ScanSection,
  imageUri: string,
): Promise<ScanSectionResult> {
  await delay(1800);
  const detections = mode === 'quick' ? QUICK_SCAN_DETECTIONS : GUIDED_SCAN_SECTIONS[section as 'fridge' | 'freezer' | 'pantry'];
  return {
    section,
    imageUri,
    detections: freshDetections(detections ?? []),
    skipped: false,
  };
}

function skippedSection(section: ScanSection): ScanSectionResult {
  return { section, imageUri: '', detections: [], skipped: true };
}

/**
 * Thrown when at least one confirmed detection could not be written to the
 * real pantry. The rows that DID persist are already in `pantry_items` (there
 * is no client delete grant, and no bulk transaction - each row is its own
 * `create_pantry_item` RPC call), so this carries the partial counts instead
 * of pretending nothing happened. Callers must not fall back to any local
 * store on this.
 */
export class ScanConfirmError extends Error {
  constructor(
    readonly addedCount: number,
    readonly failedCount: number,
    readonly failures: unknown[],
  ) {
    super(
      `Saved ${addedCount} scanned item${addedCount === 1 ? '' : 's'}; ${failedCount} could not be saved.`,
    );
    this.name = 'ScanConfirmError';
  }
}

/**
 * Persists the reviewed scan into the REAL pantry: every confirmed detection
 * is created through the same `create_pantry_item` RPC (via the repository
 * layer) that a manual "Add item" uses - identical validation, identical
 * append-only `added` ledger event, `scan_source = 'scan'`. There is no
 * separate scan insert path and no fallback to mock storage: if Supabase
 * rejects a row, that surfaces as a `ScanConfirmError`.
 *
 * Still mocked here, on purpose:
 *  - Vision/OCR inference itself (`processCapture` returns canned detections).
 *    Because a scan produces no real printed package date, every item is
 *    written with `expiration_confidence = 'unknown'` and no estimated date -
 *    the same honest result a manual add with no dates produces. A later
 *    vision Edge Function phase can supply real dates; persistence does not
 *    wait on it.
 *  - Scan *history* (`getScanHistory`): there is no `scans` table yet, so the
 *    confirmed scan is still recorded in the in-memory mock db for the
 *    history list only. This is independent of the (now real) pantry write.
 *
 * Not idempotent - `create_pantry_item` takes no idempotency key (matching
 * Phase 2's "no client-side idempotency" pantry semantics), so confirming the
 * same scan twice adds the items twice. The Review screen resets the scan
 * session on success to prevent an accidental double submit; a retry after a
 * *partial* failure will re-add the rows that already succeeded.
 */
async function confirmScan(
  scan: Scan,
  timeZone: string = 'UTC',
): Promise<{ scan: Scan; summary: ScanConfirmSummary }> {
  // Fail before touching the pantry if there's no session - never silently
  // degrade to a local write.
  await requireUserId();

  const confirmedDetections = scan.sections.flatMap((s) => s.detections).filter((d) => !d.isRemoved);

  // Shared pantry creation path - identity resolution + persistence live in
  // pantryService, never duplicated here.
  const results = await Promise.allSettled(
    confirmedDetections.map((d) =>
      pantryService.createScanItem(
        {
          ingredientId: d.ingredientId,
          name: d.name,
          imageUri: d.imageUri,
          category: d.category,
          quantity: d.quantity.value,
          unit: d.quantity.unit,
        },
        timeZone,
      ),
    ),
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason);
  const addedCount = results.length - failures.length;

  if (failures.length > 0) {
    throw new ScanConfirmError(addedCount, failures.length, failures);
  }

  const finalScan: Scan = { ...scan, status: 'confirmed' };
  // Scan-history list only (no `scans` table yet) - see the doc comment above.
  db.scans = [...db.scans, clone(finalScan)];

  const mealsPossibleEstimate = await recipeService.countReadyToCookRecipes();

  const summary: ScanConfirmSummary = {
    ingredientsAdded: addedCount,
    // Derived from the vision output in the review session, not from the
    // persisted rows (which are all 'unknown' urgency by design above).
    needsAttentionCount: confirmedDetections.filter(
      (d) => d.freshness.label === 'prioritize' || d.freshness.label === 'use_soon',
    ).length,
    quantityCorrectedCount: confirmedDetections.filter((d) => d.isQuantityEdited).length,
    mealsPossibleEstimate,
  };

  return { scan: clone(finalScan), summary };
}

async function getScanHistory(): Promise<Scan[]> {
  await delay(300);
  return clone(db.scans);
}

export const scanService = {
  startScan,
  processCapture,
  skippedSection,
  confirmScan,
  getScanHistory,
};
