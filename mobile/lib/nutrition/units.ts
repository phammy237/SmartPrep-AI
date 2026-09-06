/**
 * The one unit taxonomy for SmartPrep. Every quantity+unit anywhere in the
 * app (pantry, recipes, grocery, meal logging, later scan) is interpreted
 * through this table before any conversion is attempted.
 *
 * Three categories, and conversions are only ever deterministic WITHIN a
 * category (mass<->mass, volume<->volume). Crossing categories
 * (volume->mass, count->mass) requires ingredient-specific metadata
 * (density, per-unit weight) - see conversion.ts. This module never guesses.
 *
 * `toBase` is the factor to the category's canonical base:
 *   mass   -> grams
 *   volume -> millilitres
 *   count  -> (no base; a "count" has no intrinsic mass or volume)
 *
 * The app currently STORES only a 13-unit subset in the database
 * (types/common.ts `QuantityUnit`: item, container, bag, bottle, can,
 * package, serving, g, kg, oz, lb, ml, L). The extra units here (mg, tsp,
 * tbsp, cup, piece, clove, slice) are recognized so this foundation is
 * reusable by recipe import / scan later without another rewrite - nothing
 * writes them yet.
 */

export type UnitCategory = 'mass' | 'volume' | 'count';

interface UnitDef {
  category: UnitCategory;
  /** Factor to the category base (grams for mass, ml for volume). Absent for count units. */
  toBase?: number;
}

// US customary volume (matches how recipes are written in the US); mass is SI + avoirdupois.
const UNIT_TABLE: Record<string, UnitDef> = {
  // MASS -> grams
  mg: { category: 'mass', toBase: 0.001 },
  g: { category: 'mass', toBase: 1 },
  kg: { category: 'mass', toBase: 1000 },
  oz: { category: 'mass', toBase: 28.349523125 },
  lb: { category: 'mass', toBase: 453.59237 },

  // VOLUME -> millilitres
  ml: { category: 'volume', toBase: 1 },
  l: { category: 'volume', toBase: 1000 },
  tsp: { category: 'volume', toBase: 4.92892159375 },
  tbsp: { category: 'volume', toBase: 14.78676478125 },
  cup: { category: 'volume', toBase: 236.5882365 },

  // COUNT / PACKAGE - no intrinsic base. Only the ones the app actually uses.
  item: { category: 'count' },
  piece: { category: 'count' },
  serving: { category: 'count' },
  clove: { category: 'count' },
  slice: { category: 'count' },
  can: { category: 'count' },
  bag: { category: 'count' },
  bottle: { category: 'count' },
  package: { category: 'count' },
  container: { category: 'count' },
};

/** Aliases fold onto a canonical key before lookup. Case-insensitive. */
const UNIT_ALIASES: Record<string, string> = {
  L: 'l',
  liter: 'l',
  litre: 'l',
  litres: 'l',
  liters: 'l',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  millilitres: 'ml',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cups: 'cup',
  items: 'item',
  pieces: 'piece',
  cloves: 'clove',
  slices: 'slice',
  cans: 'can',
  bags: 'bag',
  bottles: 'bottle',
  packages: 'package',
  pkg: 'package',
  containers: 'container',
  servings: 'serving',
};

/** Canonical lowercase unit key, or null if the unit is not recognized at all. */
export function normalizeUnit(unit: string): string | null {
  if (typeof unit !== 'string') return null;
  const trimmed = unit.trim();
  if (trimmed.length === 0) return null;
  const direct = UNIT_ALIASES[trimmed] ?? trimmed;
  const lower = direct.toLowerCase();
  const viaLowerAlias = UNIT_ALIASES[lower] ?? lower;
  return UNIT_TABLE[viaLowerAlias] ? viaLowerAlias : null;
}

export function isKnownUnit(unit: string): boolean {
  return normalizeUnit(unit) !== null;
}

export function unitCategory(unit: string): UnitCategory | null {
  const key = normalizeUnit(unit);
  return key ? UNIT_TABLE[key].category : null;
}

/** Factor to the category base (grams / ml). Null for count units or unknown units. */
export function unitToBaseFactor(unit: string): number | null {
  const key = normalizeUnit(unit);
  if (!key) return null;
  return UNIT_TABLE[key].toBase ?? null;
}

export function sameCategory(a: string, b: string): boolean {
  const ca = unitCategory(a);
  const cb = unitCategory(b);
  return ca !== null && ca === cb;
}

/** Every canonical unit key, for tests / UI pickers. */
export const CANONICAL_UNITS: string[] = Object.keys(UNIT_TABLE);
