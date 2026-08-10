import { GUIDED_SCAN_SECTIONS, QUICK_SCAN_DETECTIONS } from '@/data';
import { Scan, ScanConfirmSummary, ScanDetection, ScanMode, ScanSection, ScanSectionResult } from '@/types';
import { generateId } from '@/utils/id';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';
import { pantryService } from './pantryService';
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

/** Persists the reviewed scan: adds confirmed detections to the pantry and records scan history. */
async function confirmScan(scan: Scan): Promise<{ scan: Scan; summary: ScanConfirmSummary }> {
  await delay(500);

  const confirmedDetections = scan.sections.flatMap((s) => s.detections).filter((d) => !d.isRemoved);

  await pantryService.addPantryItemsFromScan(
    confirmedDetections.map((d) => ({
      ingredientId: d.ingredientId,
      quantity: d.quantity.value,
      unit: d.quantity.unit,
      freshness: d.freshness,
      source: 'scan' as const,
    })),
  );

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
