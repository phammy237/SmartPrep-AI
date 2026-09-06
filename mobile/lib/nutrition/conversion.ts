/**
 * The central quantity-conversion engine. Nothing else in the app converts
 * units - features call these functions and branch on the explicit result.
 *
 * A conversion is only performed when it is deterministic:
 *   mass  <-> mass    : always
 *   volume <-> volume  : always
 *   volume -> mass     : only with ingredient density (g/ml)
 *   count  -> mass     : only with ingredient per-unit weight (g per item/clove/...)
 *   mass  -> volume    : only with density
 *   mass  -> count     : only with per-unit weight
 *   count <-> volume    : not supported (needs both density and per-unit weight; not justified)
 *
 * When a conversion cannot be justified the result is `{ status: 'unresolved', reason }`.
 * It NEVER returns a fabricated 0 or a guessed number.
 */

import { normalizeUnit, unitCategory, unitToBaseFactor } from './units';

export type ConversionMethod =
  | 'direct_mass'
  | 'direct_volume'
  | 'ingredient_density'
  | 'per_unit_weight'
  | 'unresolved';

export type ConversionUnresolvedReason =
  | 'invalid_quantity'
  | 'unsupported_unit'
  | 'missing_density'
  | 'missing_per_unit_weight'
  | 'incompatible_units';

export interface IngredientConversionMeta {
  /** Grams for ONE of a given count unit, e.g. { item: 174, clove: 3 }. Keys are canonical unit strings. */
  gramsPerUnit?: Record<string, number>;
  /** Grams per millilitre for volume<->mass, e.g. milk ~1.03, olive oil ~0.913, honey ~1.42. */
  densityGPerMl?: number;
}

export type GramsResult =
  | { status: 'converted'; grams: number; method: Exclude<ConversionMethod, 'unresolved'> }
  | { status: 'unresolved'; reason: ConversionUnresolvedReason };

export type ConvertResult =
  | { status: 'converted'; value: number; unit: string; method: Exclude<ConversionMethod, 'unresolved'> }
  | { status: 'unresolved'; reason: ConversionUnresolvedReason };

/**
 * Decimal-safe rounding for food quantities. Food math never needs more than
 * ~3 decimal places of a gram; rounding here also clears the tiny binary
 * floating-point residue (e.g. 0.1 + 0.2) so equal inputs give equal outputs.
 */
export function roundGrams(n: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function isValidQuantity(q: unknown): q is number {
  return typeof q === 'number' && Number.isFinite(q) && q > 0;
}

function gramsPerUnitFor(unitKey: string, meta?: IngredientConversionMeta): number | null {
  const raw = meta?.gramsPerUnit?.[unitKey];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function densityFor(meta?: IngredientConversionMeta): number | null {
  const raw = meta?.densityGPerMl;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
}

/**
 * Resolve any supported quantity+unit to grams.
 *
 * @example resolveQuantityToGrams(8, 'oz')          -> { status:'converted', grams:226.796, method:'direct_mass' }
 * @example resolveQuantityToGrams(1, 'cup', { densityGPerMl: 1.03 })
 *                                                    -> { status:'converted', grams:243.686, method:'ingredient_density' }
 * @example resolveQuantityToGrams(2, 'item', { gramsPerUnit: { item: 174 } })
 *                                                    -> { status:'converted', grams:348, method:'per_unit_weight' }
 * @example resolveQuantityToGrams(1, 'cup')          -> { status:'unresolved', reason:'missing_density' }
 * @example resolveQuantityToGrams(3, 'item')         -> { status:'unresolved', reason:'missing_per_unit_weight' }
 */
export function resolveQuantityToGrams(
  quantity: number,
  unit: string,
  meta?: IngredientConversionMeta,
): GramsResult {
  if (!isValidQuantity(quantity)) {
    return { status: 'unresolved', reason: 'invalid_quantity' };
  }
  const key = normalizeUnit(unit);
  if (!key) {
    return { status: 'unresolved', reason: 'unsupported_unit' };
  }
  const category = unitCategory(key);

  if (category === 'mass') {
    const factor = unitToBaseFactor(key) as number;
    return { status: 'converted', grams: roundGrams(quantity * factor), method: 'direct_mass' };
  }

  if (category === 'volume') {
    const density = densityFor(meta);
    if (density === null) {
      return { status: 'unresolved', reason: 'missing_density' };
    }
    const ml = quantity * (unitToBaseFactor(key) as number);
    return { status: 'converted', grams: roundGrams(ml * density), method: 'ingredient_density' };
  }

  // count
  const gramsPerUnit = gramsPerUnitFor(key, meta);
  if (gramsPerUnit === null) {
    return { status: 'unresolved', reason: 'missing_per_unit_weight' };
  }
  return { status: 'converted', grams: roundGrams(quantity * gramsPerUnit), method: 'per_unit_weight' };
}

/** Grams back out to a target unit. */
function gramsToUnit(grams: number, targetKey: string, meta?: IngredientConversionMeta): ConvertResult {
  const category = unitCategory(targetKey);
  if (category === 'mass') {
    const factor = unitToBaseFactor(targetKey) as number;
    return { status: 'converted', value: roundGrams(grams / factor), unit: targetKey, method: 'direct_mass' };
  }
  if (category === 'volume') {
    const density = densityFor(meta);
    if (density === null) return { status: 'unresolved', reason: 'missing_density' };
    const ml = grams / density;
    return {
      status: 'converted',
      value: roundGrams(ml / (unitToBaseFactor(targetKey) as number)),
      unit: targetKey,
      method: 'ingredient_density',
    };
  }
  const gramsPerUnit = gramsPerUnitFor(targetKey, meta);
  if (gramsPerUnit === null) return { status: 'unresolved', reason: 'missing_per_unit_weight' };
  return {
    status: 'converted',
    value: roundGrams(grams / gramsPerUnit),
    unit: targetKey,
    method: 'per_unit_weight',
  };
}

export interface ConvertQuantityArgs {
  quantity: number;
  fromUnit: string;
  toUnit: string;
  meta?: IngredientConversionMeta;
}

/**
 * Convert a quantity between two units. Same-category conversions are always
 * deterministic; cross-category needs `meta`. Returns an explicit unresolved
 * result rather than a guess.
 */
export function convertQuantity({ quantity, fromUnit, toUnit, meta }: ConvertQuantityArgs): ConvertResult {
  if (!isValidQuantity(quantity)) {
    return { status: 'unresolved', reason: 'invalid_quantity' };
  }
  const fromKey = normalizeUnit(fromUnit);
  const toKey = normalizeUnit(toUnit);
  if (!fromKey || !toKey) {
    return { status: 'unresolved', reason: 'unsupported_unit' };
  }

  if (fromKey === toKey) {
    // No conversion performed; report the category's "direct" method.
    const method: Exclude<ConversionMethod, 'unresolved'> =
      unitCategory(toKey) === 'volume' ? 'direct_volume' : 'direct_mass';
    return { status: 'converted', value: roundGrams(quantity), unit: toKey, method };
  }

  const fromCat = unitCategory(fromKey);
  const toCat = unitCategory(toKey);

  // Same category, both convertible -> deterministic ratio.
  if (fromCat === toCat && (fromCat === 'mass' || fromCat === 'volume')) {
    const value = (quantity * (unitToBaseFactor(fromKey) as number)) / (unitToBaseFactor(toKey) as number);
    return {
      status: 'converted',
      value: roundGrams(value),
      unit: toKey,
      method: fromCat === 'mass' ? 'direct_mass' : 'direct_volume',
    };
  }

  // count <-> count with different labels (e.g. item -> piece) cannot be
  // assumed equivalent, and count <-> volume is not supported.
  if (fromCat === 'count' && toCat === 'count') {
    return { status: 'unresolved', reason: 'incompatible_units' };
  }
  if ((fromCat === 'count' && toCat === 'volume') || (fromCat === 'volume' && toCat === 'count')) {
    return { status: 'unresolved', reason: 'incompatible_units' };
  }

  // Cross-category via grams: X -> grams -> Y. The reported method is the
  // most specific step used (density / per-unit weight outrank a plain
  // mass/volume ratio).
  const toGrams = resolveQuantityToGrams(quantity, fromKey, meta);
  if (toGrams.status === 'unresolved') {
    return toGrams;
  }
  const out = gramsToUnit(toGrams.grams, toKey, meta);
  if (out.status === 'converted' && (out.method === 'direct_mass' || out.method === 'direct_volume')) {
    return { ...out, method: toGrams.method };
  }
  return out;
}
