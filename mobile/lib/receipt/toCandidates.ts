/**
 * The pure receipt-normalization orchestrator: a provider-neutral
 * `ReceiptOcrResult` -> a list of reviewable `ReceiptIntakeCandidate`s.
 *
 * - Noise lines (tax / total / payment / loyalty / ...) are dropped
 *   deterministically, provider structure first.
 * - Names are conservatively cleaned; abbreviations are NOT expanded as fact.
 * - Quantity/unit follow receipt semantics (count != mass/volume).
 * - Identity is EXACT canonical only; anything else stays unresolved for review.
 * - Nothing here calls the network or writes anything.
 */

import { INGREDIENTS_BY_ID, resolveCanonicalIngredient } from '@/data';
import {
  IngredientCategory,
  ReceiptIntakeCandidate,
  ReceiptOcrResult,
  ReceiptRawLine,
  ReceiptReviewReason,
} from '@/types';
import { classifyLine } from './noiseFilter';
import { conservativeName } from './normalizeName';
import { parseReceiptQuantity } from './quantity';

const HIGH_CONFIDENCE = 85;
const CHECK_CONFIDENCE = 60;

function bucketFor(confidence: number | undefined, ambiguous: boolean): 'high' | 'check' | 'low' {
  const c = typeof confidence === 'number' ? confidence : 0;
  if (ambiguous) return c >= CHECK_CONFIDENCE ? 'check' : 'low';
  if (c >= HIGH_CONFIDENCE) return 'high';
  if (c >= CHECK_CONFIDENCE) return 'check';
  return 'low';
}

function categoryFor(canonicalId: string | undefined): IngredientCategory {
  if (!canonicalId) return 'other';
  const cat = INGREDIENTS_BY_ID[canonicalId]?.category;
  const allowed: IngredientCategory[] = ['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other'];
  return cat && allowed.includes(cat as IngredientCategory) ? (cat as IngredientCategory) : 'other';
}

function candidateFromLine(line: ReceiptRawLine): ReceiptIntakeCandidate | null {
  const klass = classifyLine(line);
  if (klass === 'noise') return null;

  const evidence = line.itemText ?? line.rawText ?? '';
  const displayName = conservativeName(evidence);
  const qty = parseReceiptQuantity(evidence, line.quantity, line.unitText);
  const canonical = resolveCanonicalIngredient(displayName);
  const canonicalIngredientId = canonical?.id;
  const ambiguous = klass === 'ambiguous';
  const confidence = bucketFor(line.confidence, ambiguous);

  const reviewReasons: ReceiptReviewReason[] = [];
  if (ambiguous) reviewReasons.push('ambiguous_line');
  if (confidence === 'low') reviewReasons.push('low_ocr_confidence');
  if (qty.reason === 'quantity_missing') reviewReasons.push('quantity_missing');
  if (qty.reason === 'unit_unresolved' || qty.unit == null) reviewReasons.push('unit_unresolved');
  if (!canonicalIngredientId) reviewReasons.push('identity_unresolved');

  // "ready" needs: a real item line, confident OCR, a usable quantity + unit.
  // (An unresolved canonical identity does NOT block - same as barcode branded.)
  const blockingReasons = reviewReasons.filter((r) => r !== 'identity_unresolved');
  const status = !ambiguous && confidence !== 'low' && blockingReasons.length === 0 ? 'ready' : 'needs_review';

  return {
    candidateId: `L${line.id}`,
    rawText: line.rawText ?? evidence,
    displayName,
    quantity: qty.quantity,
    unit: qty.unit,
    category: categoryFor(canonicalIngredientId),
    price: line.unitPrice ?? line.lineTotal,
    selected: status === 'ready',
    confidence,
    status,
    canonicalIngredientId,
    sourceLineId: line.id,
    reviewReasons,
  };
}

export function ocrResultToCandidates(result: ReceiptOcrResult): ReceiptIntakeCandidate[] {
  return result.lines
    .map(candidateFromLine)
    .filter((c): c is ReceiptIntakeCandidate => c !== null);
}
