/**
 * Nutrition is normalized to a per-100-grams basis and every real quantity
 * value is derived from grams. This module holds the per-100g shape and the
 * pure scaling function; USDA fetching lives in the repository/Edge Function,
 * and combining identity + quantity + reference into a snapshot lives in
 * resolveNutrition.ts.
 */

import { NUTRIENT_KEYS, NutrientKey } from '@/types';

/**
 * Nutrients per 100 g of an ingredient. Same seven nutrients the rest of the
 * app uses (types/nutrition.ts). Every field is nullable/optional - unknown
 * is null, never a fabricated 0.
 */
export type NutrientBasisPer100g = Partial<Record<NutrientKey, number | null>>;

/** Where a nutrition reference came from and how much to trust it. */
export type NutritionReferenceSource = 'usda' | 'user_override' | 'catalog_estimate' | 'none';

/**
 * How resolved a nutrition reference is:
 *   verified   - a defensible USDA match (exact/canonical) or an explicit human confirmation
 *   candidate  - a USDA row exists but has not been confirmed by rule or human
 *   estimated  - authored catalog approximation (or a user override without USDA backing)
 *   none       - no reference available at all
 */
export type NutritionReferenceStatus = 'verified' | 'candidate' | 'estimated' | 'none';

export interface NutritionReference {
  status: NutritionReferenceStatus;
  source: NutritionReferenceSource;
  per100g: NutrientBasisPer100g | null;
  fdcId?: number | null;
  verifiedAt?: string | null;
}

const NUMERIC = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Coerce an arbitrary object into a clean NutrientBasisPer100g (drops unknown / negative / non-finite values). */
export function toNutrientBasis(raw: unknown): NutrientBasisPer100g {
  const out: NutrientBasisPer100g = {};
  if (raw && typeof raw === 'object') {
    for (const key of NUTRIENT_KEYS) {
      const v = NUMERIC((raw as Record<string, unknown>)[key]);
      if (v !== null) out[key] = v;
    }
  }
  return out;
}

/** True when at least one nutrient in the basis is known. */
export function basisHasAnyNutrient(basis: NutrientBasisPer100g | null | undefined): boolean {
  if (!basis) return false;
  return NUTRIENT_KEYS.some((k) => typeof basis[k] === 'number');
}

export interface ScaledNutrients {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

/** Round a nutrient value to a sensible display precision (1 dp), decimal-safe. */
function roundNutrient(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

/**
 * Scale a per-100g basis to `grams`. Unknown nutrients stay null (never 0).
 * `grams` must be a positive finite number.
 */
export function scaleBasisToGrams(basis: NutrientBasisPer100g, grams: number): ScaledNutrients {
  if (!(typeof grams === 'number' && Number.isFinite(grams) && grams > 0)) {
    throw new Error('scaleBasisToGrams: grams must be a positive finite number');
  }
  const factor = grams / 100;
  const scale = (k: NutrientKey): number | null => {
    const v = basis[k];
    return typeof v === 'number' ? roundNutrient(v * factor) : null;
  };
  return {
    calories: scale('calories'),
    proteinG: scale('proteinG'),
    carbsG: scale('carbsG'),
    fatG: scale('fatG'),
    fiberG: scale('fiberG'),
    sugarG: scale('sugarG'),
    sodiumMg: scale('sodiumMg'),
  };
}
