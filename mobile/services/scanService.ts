import { getIngredient, GUIDED_SCAN_SECTIONS, QUICK_SCAN_DETECTIONS } from '@/data';
import { PantryItem, Scan, ScanConfirmSummary, ScanDetection, ScanMode, ScanSection, ScanSectionResult } from '@/types';
import { generateId } from '@/utils/id';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';
import { recipeService } from './recipeService';

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
 * Persists the reviewed scan: adds confirmed detections to the pantry and
 * records scan history.
 *
 * Scan (vision/OCR) itself is still entirely mocked - real pantry
 * persistence (Phase 2) intentionally does not connect to it yet, since
 * building real scan-to-pantry ingestion is explicitly a later phase. So
 * this still writes to the mock `db.pantry` array (as it always has), which
 * is a *separate* store from the real Supabase `pantry_items` table the
 * rest of the pantry feature now reads/writes - confirming a scan will not
 * make items show up in the real pantry list until scan itself is wired up.
 */
async function confirmScan(scan: Scan): Promise<{ scan: Scan; summary: ScanConfirmSummary }> {
  await delay(500);

  const confirmedDetections = scan.sections.flatMap((s) => s.detections).filter((d) => !d.isRemoved);
  const now = new Date().toISOString();
  const addedItems: PantryItem[] = confirmedDetections.map((d) => {
    const ingredient = getIngredient(d.ingredientId);
    return {
      id: generateId('pantry'),
      ingredientId: ingredient.id,
      name: ingredient.name,
      imageUri: ingredient.imageUri,
      category: ingredient.category,
      quantity: d.quantity.value,
      unit: d.quantity.unit,
      freshness: d.freshness,
      addedAt: now,
      updatedAt: now,
      source: 'scan',
    };
  });
  db.pantry = [...db.pantry, ...addedItems];

  const finalScan: Scan = { ...scan, status: 'confirmed' };
  db.scans = [...db.scans, clone(finalScan)];

  const mealsPossibleEstimate = await recipeService.countReadyToCookRecipes();

  const summary: ScanConfirmSummary = {
    ingredientsAdded: confirmedDetections.length,
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
