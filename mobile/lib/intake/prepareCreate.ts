/**
 * The shared review -> identity -> expiration -> create-input step. Barcode and
 * Receipt intake both call this so there is ONE definition of "what a reviewed
 * pantry candidate becomes" - not a per-provider re-implementation.
 *
 * It never touches the network or the database; it just prepares the argument
 * for `createPantryItem` (which is the sole `create_pantry_item` RPC path, and
 * the sole place a pantry item + its `added` event are written).
 */

import { generateId } from '@/utils/id';
import { estimateExpiration } from '@/utils/expiration';
import { ingredientPhotoUri } from '@/utils/ingredientPhoto';
import { resolvePantryIdentity } from './identity';
import { IntakeCandidate, PreparedIntakeCreateInput } from './types';

export function prepareIntakeCreateInput(candidate: IntakeCandidate): PreparedIntakeCreateInput {
  const syntheticPrefix = candidate.provenance === 'barcode' ? 'ing-barcode' : 'ing-receipt';
  const providerImage =
    candidate.provenance === 'barcode' && candidate.imageUrl && /^https:\/\//.test(candidate.imageUrl)
      ? candidate.imageUrl
      : undefined;

  const identity = resolvePantryIdentity({
    hintId: generateId(syntheticPrefix),
    name: candidate.displayName,
    fallbackImageUri: providerImage ?? ingredientPhotoUri(generateId(syntheticPrefix), candidate.displayName),
    syntheticPrefix,
  });

  // Same rule everywhere: a printed date wins ('high'); else a purchase date
  // drives the category heuristic ('medium'); with neither, confidence stays
  // 'unknown' and no expiry date is fabricated. Receipt OCR never supplies one.
  const estimate = estimateExpiration({
    category: candidate.category,
    purchaseDate: candidate.purchaseDate,
    userProvidedDate: candidate.userProvidedDate,
  });

  const base: PreparedIntakeCreateInput = {
    ingredientId: identity.ingredientId,
    imageUri: identity.imageUri,
    displayName: candidate.displayName,
    category: candidate.category,
    quantity: candidate.quantity,
    unit: candidate.unit,
    storageLocation: candidate.storageLocation,
    notes: candidate.notes,
    purchaseDate: candidate.purchaseDate,
    userProvidedDate: candidate.userProvidedDate,
    userProvidedDateType: candidate.userProvidedDateType,
    estimatedExpirationDate: estimate.estimatedExpirationDate,
    expirationConfidence: estimate.confidence,
    source: candidate.provenance,
    canonicalIdentity: identity.canonical,
  };

  if (candidate.provenance === 'barcode') {
    return { ...base, barcode: candidate.barcode, brand: candidate.brand, fdcId: candidate.fdcId };
  }
  return {
    ...base,
    sourceReceiptCandidateId: candidate.candidateId,
    sourceReceiptId: candidate.receiptScanId,
  };
}
