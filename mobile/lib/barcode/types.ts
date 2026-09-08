/**
 * Provider-neutral barcode lookup contract. Raw provider payloads never leave
 * the `lib/barcode` provider adapters - screens, hooks and services only ever
 * see `BarcodeProductCandidate` / `BarcodeLookupResult`.
 */

import { IngredientCategory, QuantityUnit } from '@/types';

export type BarcodeProductSource = 'open_food_facts';

/** Per-100g nutrition in SmartPrep's canonical units. Null = the provider didn't have it. */
export interface BarcodeNutritionPer100g {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
}

export interface BarcodeProductNutrition {
  per100g: BarcodeNutritionPer100g;
  /** Which provider these numbers came from - NEVER presented as USDA-verified. */
  source: BarcodeProductSource;
  /** True when at least one nutrient is known. */
  hasAnyValue: boolean;
}

export interface BarcodeProductCandidate {
  /** The scanned/typed barcode, normalized. Persisted verbatim as provenance. */
  barcode: string;
  /** The real product display name (often branded, e.g. "Chobani Nonfat Greek Yogurt"). Never coerced to a generic ingredient. */
  productName: string;
  brand?: string;
  /** Provider-hosted image URL (hotlinked, never copied into Supabase). https only. */
  imageUrl?: string;

  /** Net package amount the provider reports (e.g. 500 for "500 g"). Advisory - never silently becomes the pantry quantity. */
  packageQuantity?: number;
  /** Package unit, only when it maps to a supported pantry unit. */
  packageUnit?: QuantityUnit;
  /** The provider's package string verbatim (e.g. "NET WT 16 OZ", "1,5 L"). Shown for context. */
  packageRawText?: string;

  ingredientsText?: string;
  nutrition?: BarcodeProductNutrition;
  servingSize?: number;
  servingUnit?: QuantityUnit;

  /** Coarse, conservative category guess from provider tags. Default 'other'. */
  categoryGuess?: IngredientCategory;

  source: BarcodeProductSource;
  /** Provider's own id for the product (Open Food Facts: the barcode itself). */
  sourceProductId: string;

  /** What the provider actually returned - drives which review fields need user input. */
  completeness: {
    hasName: boolean;
    hasBrand: boolean;
    hasNutrition: boolean;
    hasPackageSize: boolean;
    hasImage: boolean;
  };
}

export type BarcodeLookupErrorReason =
  | 'invalid_barcode'
  | 'offline'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'auth'
  | 'malformed_response'
  | 'unknown';

export type BarcodeLookupResult =
  | { status: 'found'; product: BarcodeProductCandidate }
  | { status: 'not_found'; barcode: string }
  | { status: 'error'; reason: BarcodeLookupErrorReason; barcode: string };
