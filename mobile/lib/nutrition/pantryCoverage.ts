/**
 * Quantity-aware pantry coverage for a single recipe ingredient.
 *
 * Replaces the old binary "ingredient exists / ingredient missing" check.
 * For one recipe requirement and the set of matching pantry lots it answers:
 *
 *   covered     - pantry stock (summed across lots) meets or exceeds the requirement
 *   partial     - some usable stock, but not enough -> a real shortfall
 *   missing     - no matching pantry stock at all
 *   unresolved  - there IS matching stock, but the units cannot be compared
 *                 safely with the available conversion metadata. This is NOT
 *                 "missing" - we do not claim zero usable stock.
 *
 * All conversion goes through the shared engine in conversion.ts - this
 * module adds no unit math of its own beyond summing same-unit quantities.
 */

import {
  ConversionMethod,
  ConversionUnresolvedReason,
  IngredientConversionMeta,
  convertQuantity,
  resolveQuantityToGrams,
  roundGrams,
} from './conversion';
import { normalizeUnit } from './units';

export type IngredientCoverageStatus = 'covered' | 'partial' | 'missing' | 'unresolved';

export interface PantryLot {
  /** Positive quantity in `unit`. Callers filter out depleted / zero lots. */
  quantity: number;
  unit: string;
}

export interface IngredientCoverageInput {
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: string;
  isPantryStaple?: boolean;
  /** Pantry lots already filtered to this canonical ingredient AND active/in-stock. */
  lots: PantryLot[];
  conversionMeta?: IngredientConversionMeta;
}

export interface IngredientCoverage {
  status: IngredientCoverageStatus;
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: string;
  matchedLotCount: number;
  /** How the comparison was made. */
  basis: 'staple' | 'no_lots' | 'same_unit' | 'grams' | 'unresolved';
  method?: ConversionMethod;
  /** In `requiredUnit` - only on the same-unit basis. */
  availableQuantity?: number;
  shortfallQuantity?: number;
  shortfallUnit?: string;
  requiredGrams?: number;
  availableGrams?: number;
  shortfallGrams?: number;
  reason?: ConversionUnresolvedReason | 'no_matching_pantry_stock';
}

function validQty(q: unknown): q is number {
  return typeof q === 'number' && Number.isFinite(q) && q > 0;
}

export function computeIngredientCoverage(input: IngredientCoverageInput): IngredientCoverage {
  const { ingredientId, requiredQuantity, requiredUnit, isPantryStaple, lots, conversionMeta } = input;
  const base = {
    ingredientId,
    requiredQuantity,
    requiredUnit,
    matchedLotCount: lots.length,
  };

  if (isPantryStaple) {
    return { ...base, status: 'covered', basis: 'staple' };
  }
  if (lots.length === 0) {
    return { ...base, status: 'missing', basis: 'no_lots', reason: 'no_matching_pantry_stock' };
  }
  if (!validQty(requiredQuantity)) {
    return { ...base, status: 'unresolved', basis: 'unresolved', reason: 'invalid_quantity' };
  }
  const reqKey = normalizeUnit(requiredUnit);
  if (!reqKey) {
    return { ...base, status: 'unresolved', basis: 'unresolved', reason: 'unsupported_unit' };
  }
  if (lots.some((l) => !validQty(l.quantity) || normalizeUnit(l.unit) === null)) {
    return { ...base, status: 'unresolved', basis: 'unresolved', reason: 'unsupported_unit' };
  }

  // ---- Same-unit path: no metadata needed (works for count units too) ----
  if (lots.every((l) => normalizeUnit(l.unit) === reqKey)) {
    const available = roundGrams(lots.reduce((sum, l) => sum + l.quantity, 0));
    const reqG = resolveQuantityToGrams(requiredQuantity, reqKey, conversionMeta);
    const availG = resolveQuantityToGrams(available, reqKey, conversionMeta);
    const grams =
      reqG.status === 'converted' && availG.status === 'converted'
        ? { requiredGrams: reqG.grams, availableGrams: availG.grams }
        : {};

    if (available >= requiredQuantity) {
      return { ...base, status: 'covered', basis: 'same_unit', availableQuantity: available, ...grams };
    }
    return {
      ...base,
      status: 'partial',
      basis: 'same_unit',
      availableQuantity: available,
      shortfallQuantity: roundGrams(requiredQuantity - available),
      shortfallUnit: reqKey,
      ...(grams.requiredGrams !== undefined
        ? { ...grams, shortfallGrams: roundGrams(grams.requiredGrams - (grams.availableGrams as number)) }
        : {}),
    };
  }

  // ---- Grams path: needs every quantity to resolve to grams ----
  const reqG = resolveQuantityToGrams(requiredQuantity, reqKey, conversionMeta);
  if (reqG.status === 'unresolved') {
    return { ...base, status: 'unresolved', basis: 'unresolved', reason: reqG.reason };
  }
  const lotG = lots.map((l) => resolveQuantityToGrams(l.quantity, l.unit, conversionMeta));
  const firstUnresolved = lotG.find((r) => r.status === 'unresolved');
  if (firstUnresolved && firstUnresolved.status === 'unresolved') {
    // Matching stock exists but cannot be compared - unresolved, NOT missing.
    return { ...base, status: 'unresolved', basis: 'unresolved', reason: firstUnresolved.reason };
  }

  const availableGrams = roundGrams(
    lotG.reduce((sum, r) => sum + (r.status === 'converted' ? r.grams : 0), 0),
  );
  const requiredGrams = reqG.grams;

  if (availableGrams >= requiredGrams) {
    return { ...base, status: 'covered', basis: 'grams', method: reqG.method, requiredGrams, availableGrams };
  }
  if (availableGrams > 0) {
    return {
      ...base,
      status: 'partial',
      basis: 'grams',
      method: reqG.method,
      requiredGrams,
      availableGrams,
      shortfallGrams: roundGrams(requiredGrams - availableGrams),
    };
  }
  return { ...base, status: 'missing', basis: 'grams', method: reqG.method, requiredGrams, availableGrams: 0 };
}

export interface ShortfallLine {
  quantity: number;
  unit: string;
  /** 'uncovered_shortfall' for partial coverage; 'recipe_requirement' for missing/unresolved. */
  quantityBasis: 'uncovered_shortfall' | 'recipe_requirement';
  /** e.g. { coverage: 'unresolved', reason: 'missing_density' } - never dropped, never silently subtracted. */
  metadata: Record<string, unknown>;
}

/**
 * Turn a coverage result into the grocery line to add. Preserves the recipe's
 * original unit whenever the shortfall can be expressed in it deterministically;
 * only falls back to grams when it cannot. `covered` returns null (nothing to buy).
 */
export function shortfallLineFor(
  coverage: IngredientCoverage,
  conversionMeta?: IngredientConversionMeta,
): ShortfallLine | null {
  if (coverage.status === 'covered') return null;

  if (coverage.status === 'missing') {
    return {
      quantity: coverage.requiredQuantity,
      unit: coverage.requiredUnit,
      quantityBasis: 'recipe_requirement',
      metadata: { coverage: 'missing' },
    };
  }

  if (coverage.status === 'unresolved') {
    // Conservative: buy the full requirement rather than guess a subtraction.
    return {
      quantity: coverage.requiredQuantity,
      unit: coverage.requiredUnit,
      quantityBasis: 'recipe_requirement',
      metadata: { coverage: 'unresolved', reason: coverage.reason ?? 'incomparable_units' },
    };
  }

  // partial
  if (coverage.shortfallQuantity !== undefined) {
    return {
      quantity: coverage.shortfallQuantity,
      unit: coverage.shortfallUnit ?? coverage.requiredUnit,
      quantityBasis: 'uncovered_shortfall',
      metadata: { coverage: 'partial' },
    };
  }

  if (coverage.shortfallGrams !== undefined) {
    // Prefer the recipe's original unit if grams convert back deterministically.
    const backToUnit = convertQuantity({
      quantity: coverage.shortfallGrams,
      fromUnit: 'g',
      toUnit: coverage.requiredUnit,
      meta: conversionMeta,
    });
    if (backToUnit.status === 'converted') {
      return {
        quantity: backToUnit.value,
        unit: backToUnit.unit,
        quantityBasis: 'uncovered_shortfall',
        metadata: { coverage: 'partial', shortfallGrams: coverage.shortfallGrams },
      };
    }
    return {
      quantity: coverage.shortfallGrams,
      unit: 'g',
      quantityBasis: 'uncovered_shortfall',
      metadata: { coverage: 'partial', originalUnit: coverage.requiredUnit },
    };
  }

  // partial with neither shortfall figure (shouldn't happen) - conservative fallback.
  return {
    quantity: coverage.requiredQuantity,
    unit: coverage.requiredUnit,
    quantityBasis: 'recipe_requirement',
    metadata: { coverage: 'partial_indeterminate' },
  };
}
