export interface NutritionFacts {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export type NutritionStatus = 'verified' | 'estimated' | 'incomplete';

/** What the numbers in a NutritionSnapshot represent - one serving, one gram, or a whole prepared batch. */
export type NutritionCalculationBasis = 'per_serving' | 'per_gram' | 'per_batch' | 'manual_entry';

export const NUTRIENT_KEYS = ['calories', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'sodiumMg'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/**
 * The one nutrition-snapshot shape used everywhere (recipe versions,
 * prepared meals, meal logs). Every nutrient is nullable - null/absent means
 * genuinely unknown, never coerced to zero. Only `status` is guaranteed.
 * Mirrors the SQL `is_valid_nutrition_snapshot` check in migration 0003 -
 * keep both in sync by hand (there's no shared import across languages).
 */
export interface NutritionSnapshot {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  status: NutritionStatus;
  calculationBasis: NutritionCalculationBasis;
  /** Free-text caveat, e.g. "fiber not counted for this ingredient". Never used to imply false precision. */
  uncertaintyNotes?: string | null;
}

/**
 * Result of summing 0+ NutritionSnapshots. A field is null only when NONE of
 * the inputs knew it (contributingCount > 0); summing zero inputs yields all
 * fields 0 (a legitimate "nothing consumed" total, not "unknown"). Fields
 * that were known in only SOME inputs are still summed (from the ones that
 * knew) but listed in `incompleteFields` so a partial total is never
 * presented as a fully known one.
 */
export interface NutritionTotal {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
  /** Worst-case status across every contributing snapshot (incomplete > estimated > verified). */
  status: NutritionStatus;
  incompleteFields: NutrientKey[];
  contributingCount: number;
}

export type MacroConsistencyResult =
  | { status: 'not_applicable' }
  | { status: 'ok'; expectedCalories: number }
  | { status: 'warning'; expectedCalories: number; deltaPercent: number };
