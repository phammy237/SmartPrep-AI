import {
  CookingEventStatus,
  MacroConsistencyResult,
  MatchConfidence,
  MealPlanStatus,
  NUTRIENT_KEYS,
  NutrientKey,
  NutritionSnapshot,
  NutritionStatus,
  NutritionTotal,
} from '@/types';
import { todayIsoDateInTimeZone } from './expiration';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A recipe ingredient's requested amount at the recipe's base servings, scaled to how many servings were actually prepared. */
export function scaleRequestedQuantity(baseQuantityAtRecipeServings: number, recipeServings: number, actualServingsPrepared: number): number {
  const factor = recipeServings > 0 ? actualServingsPrepared / recipeServings : 1;
  return round2(baseQuantityAtRecipeServings * factor);
}

export interface PantryMatchCandidate {
  id: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  status: 'active' | 'depleted';
}

export interface ResolvedPantryMatch {
  pantryItemId?: string;
  availableQuantity?: number;
  pantryUnit?: string;
  unitsCompatible: boolean;
  deductedQuantity: number;
  matchConfidence: MatchConfidence;
  wasSkipped: boolean;
  notSourcedFromPantry: boolean;
}

/**
 * Resolves a recipe ingredient's proposed deduction against one specific
 * candidate pantry item (or none, for "skip"/"not sourced from pantry").
 * Used both for the initial auto-suggested match and for a user-initiated
 * remap, so both paths share the exact same safety rules:
 *  - a depleted item (quantity <= 0) or an inactive one is never selectable
 *    - it resolves the same as no candidate at all (skipped).
 *  - an incompatible unit is never silently deducted from - it resolves to
 *    skipped with the mismatch still recorded (never a fabricated conversion).
 *  - the deducted amount is always clamped to the candidate's live stock,
 *    so a remap can never propose deducting more than is actually available.
 *  - confidence is 'exact' when the candidate's own ingredientId matches the
 *    recipe ingredient's (the original auto-suggested case), 'likely' when
 *    the user manually chose a different, unit-compatible item.
 */
export function resolvePantryMatch(
  requestedQuantity: number,
  requestedUnit: string | undefined,
  ingredientId: string,
  candidate: PantryMatchCandidate | null | undefined,
): ResolvedPantryMatch {
  if (!candidate || candidate.status !== 'active' || candidate.quantity <= 0) {
    return {
      pantryItemId: undefined,
      availableQuantity: undefined,
      pantryUnit: undefined,
      unitsCompatible: false,
      deductedQuantity: 0,
      matchConfidence: 'none',
      wasSkipped: true,
      notSourcedFromPantry: true,
    };
  }

  const unitsCompatible = !!requestedUnit && candidate.unit === requestedUnit;
  if (!unitsCompatible) {
    return {
      pantryItemId: candidate.id,
      availableQuantity: candidate.quantity,
      pantryUnit: candidate.unit,
      unitsCompatible: false,
      deductedQuantity: 0,
      matchConfidence: 'uncertain',
      wasSkipped: true,
      notSourcedFromPantry: false,
    };
  }

  return {
    pantryItemId: candidate.id,
    availableQuantity: candidate.quantity,
    pantryUnit: candidate.unit,
    unitsCompatible: true,
    deductedQuantity: Math.min(requestedQuantity, candidate.quantity),
    matchConfidence: candidate.ingredientId === ingredientId ? 'exact' : 'likely',
    wasSkipped: false,
    notSourcedFromPantry: false,
  };
}

/** Active, in-stock, unit-compatible pantry items only - the sole set a remap picker may ever offer, so it can never let the user select an incompatible or depleted item. */
export function findCompatiblePantryCandidates(
  requestedUnit: string | undefined,
  candidates: PantryMatchCandidate[],
): PantryMatchCandidate[] {
  return candidates.filter((c) => c.status === 'active' && c.quantity > 0 && c.unit === requestedUnit);
}

/** Scales every KNOWN nutrient by `factor`; unknown (null) nutrients stay null - never fabricated. */
export function scaleNutritionSnapshot(snapshot: NutritionSnapshot, factor: number): NutritionSnapshot {
  const scaled = { ...snapshot };
  for (const key of NUTRIENT_KEYS) {
    const value = snapshot[key];
    scaled[key] = value == null ? null : value * factor;
  }
  return scaled;
}

const STATUS_RANK: Record<NutritionStatus, number> = { verified: 0, estimated: 1, incomplete: 2 };

function worseStatus(a: NutritionStatus, b: NutritionStatus): NutritionStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

/**
 * Sums 0+ nutrition snapshots. A field is null only when NONE of the inputs
 * knew it and there was at least one input (contributingCount > 0); summing
 * zero inputs yields all-known-zero (a real "nothing logged" total, not
 * "unknown"). A field known by only SOME inputs is still summed from the
 * ones that knew it, but listed in `incompleteFields` - the total is real
 * but a partial undercount, never silently presented as complete.
 */
export function sumNutritionSnapshots(snapshots: NutritionSnapshot[]): NutritionTotal {
  const contributingCount = snapshots.length;
  const totals: Partial<Record<NutrientKey, number>> = {};
  const knownCounts: Partial<Record<NutrientKey, number>> = {};
  let status: NutritionStatus = 'verified';

  for (const snapshot of snapshots) {
    status = worseStatus(status, snapshot.status);
    for (const key of NUTRIENT_KEYS) {
      const value = snapshot[key];
      if (value != null) {
        totals[key] = (totals[key] ?? 0) + value;
        knownCounts[key] = (knownCounts[key] ?? 0) + 1;
      }
    }
  }

  const incompleteFields: NutrientKey[] = [];
  const result = {} as Record<NutrientKey, number | null>;

  for (const key of NUTRIENT_KEYS) {
    const known = knownCounts[key] ?? 0;
    if (contributingCount === 0) {
      result[key] = 0;
    } else if (known === 0) {
      result[key] = null;
    } else {
      result[key] = totals[key] ?? 0;
      if (known < contributingCount) {
        incompleteFields.push(key);
      }
    }
  }

  if (incompleteFields.length > 0) {
    status = worseStatus(status, 'incomplete');
  }
  if (contributingCount === 0) {
    status = 'verified';
  }

  return { ...result, status, incompleteFields, contributingCount };
}

/**
 * Validates approximate calorie/macro consistency (4P + 4C + 9F) as a
 * data-quality WARNING, never a hard rejection - only runs when calories,
 * protein, carbs, and fat are all known; anything else is 'not_applicable'
 * rather than a false positive. The tolerance is generous (max of 15% or a
 * flat 50kcal) so rounding, fiber, and sugar alcohols don't trip it.
 */
export function checkMacroCalorieConsistency(snapshot: NutritionSnapshot): MacroConsistencyResult {
  const { calories, proteinG, carbsG, fatG } = snapshot;
  if (calories == null || proteinG == null || carbsG == null || fatG == null) {
    return { status: 'not_applicable' };
  }
  const expectedCalories = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (expectedCalories <= 0) {
    return { status: 'not_applicable' };
  }
  const deltaPercent = (Math.abs(calories - expectedCalories) / expectedCalories) * 100;
  const tolerancePercent = Math.max(15, (50 / expectedCalories) * 100);
  if (deltaPercent > tolerancePercent) {
    return { status: 'warning', expectedCalories, deltaPercent };
  }
  return { status: 'ok', expectedCalories };
}

export interface MealLogNutritionLike {
  localDate: string;
  nutritionSnapshot: NutritionSnapshot;
  voidedAt?: string | null;
}

/** Only meal_logs within the exact local day count - never planned items, never a different day. */
export function dailyNutritionTotal(logs: MealLogNutritionLike[], localDate: string): NutritionTotal {
  return sumNutritionSnapshots(
    logs.filter((log) => log.localDate === localDate && !log.voidedAt).map((log) => log.nutritionSnapshot),
  );
}

/** Inclusive [weekStart, weekEnd] range, both YYYY-MM-DD local dates. */
export function weeklyNutritionTotal(logs: MealLogNutritionLike[], weekStart: string, weekEnd: string): NutritionTotal {
  return sumNutritionSnapshots(
    logs
      .filter((log) => !log.voidedAt && log.localDate >= weekStart && log.localDate <= weekEnd)
      .map((log) => log.nutritionSnapshot),
  );
}

/**
 * Monday-Sunday week containing `now`'s local date in `timeZone` - the same
 * week-start convention plannerService already uses for "Generate My Week".
 */
export function localWeekRange(now: Date, timeZone: string): { weekStart: string; weekEnd: string } {
  const todayLocal = todayIsoDateInTimeZone(timeZone, now);
  const [y, m, d] = todayLocal.split('-').map(Number);
  const localMidnightUtc = new Date(Date.UTC(y, m - 1, d));
  const dayIndex = localMidnightUtc.getUTCDay(); // 0 = Sunday
  const diffToMonday = dayIndex === 0 ? -6 : 1 - dayIndex;

  const monday = new Date(localMidnightUtc);
  monday.setUTCDate(monday.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  return { weekStart: monday.toISOString().slice(0, 10), weekEnd: sunday.toISOString().slice(0, 10) };
}

export interface EffectiveDatedRecord<T> {
  value: T;
  effectiveStart: string;
  effectiveEnd: string | null;
}

/** Picks the record whose [effectiveStart, effectiveEnd) range contains `atDate` - null if none does. */
export function selectEffectiveGoal<T>(records: EffectiveDatedRecord<T>[], atDate: Date = new Date()): T | null {
  const atTime = atDate.getTime();
  const match = records.find((record) => {
    const start = new Date(record.effectiveStart).getTime();
    const end = record.effectiveEnd ? new Date(record.effectiveEnd).getTime() : Number.POSITIVE_INFINITY;
    return atTime >= start && atTime < end;
  });
  return match ? match.value : null;
}

export type PreparedMealConsumptionValidation = { ok: true; newRemaining: number } | { ok: false; reason: string };

/** Mirrors log_prepared_meal_consumption's server-side check, for immediate client-side feedback before submitting. */
export function validatePreparedMealConsumption(remaining: number, requested: number): PreparedMealConsumptionValidation {
  if (!(requested > 0)) {
    return { ok: false, reason: 'Enter an amount greater than zero' };
  }
  if (requested > remaining) {
    return { ok: false, reason: `Only ${remaining} serving${remaining === 1 ? '' : 's'} remaining` };
  }
  return { ok: true, newRemaining: remaining - requested };
}

const ALLOWED_PLAN_TRANSITIONS: Record<MealPlanStatus, MealPlanStatus[]> = {
  planned: ['completed', 'skipped', 'cancelled'],
  completed: [],
  skipped: ['planned'],
  cancelled: ['planned'],
};

export function isAllowedPlanTransition(from: MealPlanStatus, to: MealPlanStatus): boolean {
  if (from === to) return true;
  return ALLOWED_PLAN_TRANSITIONS[from].includes(to);
}

const ALLOWED_COOKING_TRANSITIONS: Record<CookingEventStatus, CookingEventStatus[]> = {
  started: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isAllowedCookingTransition(from: CookingEventStatus, to: CookingEventStatus): boolean {
  return ALLOWED_COOKING_TRANSITIONS[from].includes(to);
}

export interface DeductionCandidate {
  wasSkipped: boolean;
  notSourcedFromPantry: boolean;
  pantryItemId?: string;
  availableQuantity?: number;
  pantryUnit?: string;
  deductedQuantity: number;
  deductedUnit?: string;
  userConfirmed: boolean;
}

export type DeductionValidation = { ok: true } | { ok: false; reason: string };

/**
 * Client-side mirror of complete_cooking_event's per-ingredient rules -
 * matching normalized names never proves equivalent quantities or units, so
 * every non-skipped deduction needs an explicit user confirmation and an
 * exact unit match (Phase 3 has no unit-conversion table).
 */
export function validateDeduction(candidate: DeductionCandidate): DeductionValidation {
  if (candidate.wasSkipped || candidate.notSourcedFromPantry) {
    return { ok: true };
  }
  if (!candidate.pantryItemId) {
    return { ok: false, reason: 'Choose a pantry item, mark it as not from your pantry, or skip it' };
  }
  if (!candidate.userConfirmed) {
    return { ok: false, reason: 'Confirm this ingredient before finishing' };
  }
  if (!candidate.deductedUnit || candidate.deductedUnit !== candidate.pantryUnit) {
    return { ok: false, reason: 'Units are incompatible - correct the amount or skip this ingredient' };
  }
  if (!(candidate.deductedQuantity > 0)) {
    return { ok: false, reason: 'Enter an amount greater than zero' };
  }
  if (candidate.availableQuantity != null && candidate.deductedQuantity > candidate.availableQuantity) {
    return { ok: false, reason: 'Not enough in your pantry' };
  }
  return { ok: true };
}
