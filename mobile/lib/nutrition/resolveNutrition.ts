/**
 * The join point of the Phase 4 pipeline:
 *
 *   ingredient identity  (canonical id + conversion metadata)
 *   -> normalized quantity/unit
 *   -> gram conversion            (conversion.ts)
 *   -> nutrition reference        (nutritionReference.ts + repository/USDA)
 *   -> nutrition snapshot with provenance   <-- this module
 *
 * Hard rules:
 *   - If the quantity cannot be converted to grams, the result is
 *     `unresolved` - never a fabricated snapshot.
 *   - A snapshot is `verified` ONLY when the reference itself is verified.
 *     A `candidate` reference yields real numbers but a non-verified status.
 *   - Unknown nutrients stay null.
 */

import { NutritionSnapshot } from '@/types';
import {
  ConversionMethod,
  IngredientConversionMeta,
  resolveQuantityToGrams,
} from './conversion';
import {
  NutritionReference,
  NutritionReferenceSource,
  basisHasAnyNutrient,
  scaleBasisToGrams,
} from './nutritionReference';

export type NutritionResolutionStatus = 'verified' | 'candidate' | 'estimated' | 'unresolved';

export type NutritionUnresolvedReason =
  | 'invalid_quantity'
  | 'unsupported_unit'
  | 'missing_density'
  | 'missing_per_unit_weight'
  | 'incompatible_units'
  | 'no_nutrition_reference';

export interface NutritionProvenance {
  source: NutritionReferenceSource;
  fdcId: number | null;
  verifiedAt: string | null;
  conversionMethod: ConversionMethod;
}

export type NutritionResolution =
  | {
      status: 'verified' | 'candidate' | 'estimated';
      grams: number;
      snapshot: NutritionSnapshot;
      provenance: NutritionProvenance;
    }
  | {
      status: 'unresolved';
      reason: NutritionUnresolvedReason;
      grams: number | null;
      snapshot: null;
      provenance: NutritionProvenance;
    };

export interface ResolveNutritionArgs {
  quantity: number;
  unit: string;
  conversionMeta?: IngredientConversionMeta;
  reference: NutritionReference;
}

function snapshotStatusFor(refStatus: NutritionReference['status']): NutritionSnapshot['status'] {
  // Only a verified reference produces a verified snapshot. Candidate and
  // estimated both surface as 'estimated' in the persisted snapshot vocab
  // (which has no 'candidate') - the resolution status keeps the distinction.
  return refStatus === 'verified' ? 'verified' : 'estimated';
}

export function resolveIngredientNutrition({
  quantity,
  unit,
  conversionMeta,
  reference,
}: ResolveNutritionArgs): NutritionResolution {
  const grams = resolveQuantityToGrams(quantity, unit, conversionMeta);

  const baseProvenance: NutritionProvenance = {
    source: reference.source,
    fdcId: reference.fdcId ?? null,
    verifiedAt: reference.verifiedAt ?? null,
    conversionMethod: grams.status === 'converted' ? grams.method : 'unresolved',
  };

  if (grams.status === 'unresolved') {
    return { status: 'unresolved', reason: grams.reason, grams: null, snapshot: null, provenance: baseProvenance };
  }

  if (reference.status === 'none' || !basisHasAnyNutrient(reference.per100g)) {
    return {
      status: 'unresolved',
      reason: 'no_nutrition_reference',
      grams: grams.grams,
      snapshot: null,
      provenance: { ...baseProvenance, source: 'none' },
    };
  }

  const scaled = scaleBasisToGrams(reference.per100g ?? {}, grams.grams);
  const snapshot: NutritionSnapshot = {
    ...scaled,
    status: snapshotStatusFor(reference.status),
    calculationBasis: 'per_quantity',
    uncertaintyNotes:
      reference.status === 'candidate'
        ? 'Nutrition from an unconfirmed USDA candidate match.'
        : reference.status === 'estimated'
          ? 'Nutrition from an authored estimate, not USDA-verified.'
          : null,
  };

  const status: Exclude<NutritionResolutionStatus, 'unresolved'> =
    reference.status === 'verified' ? 'verified' : reference.status === 'candidate' ? 'candidate' : 'estimated';

  return { status, grams: grams.grams, snapshot, provenance: baseProvenance };
}
