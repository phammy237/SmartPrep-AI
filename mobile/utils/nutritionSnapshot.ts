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

/**
 * 'needs_decision' means there IS a compatible candidate but it does not
 * have enough stock to cover the required quantity, and the user has not
 * yet chosen what to do about it - this state is never auto-submittable.
 * 'full' and 'partial' are the only resolutions that deduct anything;
 * 'skipped'/'unmatched'/'incompatible' all deduct nothing.
 */
export type PantryMatchResolution = 'unmatched' | 'incompatible' | 'needs_decision' | 'full' | 'partial' | 'skipped';

export interface PantryDeductionRowState {
  pantryItemId?: string;
  availableQuantity?: number;
  pantryUnit?: string;
  unitsCompatible: boolean;
  /** The amount actually needed for the batch actually being cooked - never overwritten by a clamp. */
  requiredQuantity: number;
  /** requiredQuantity - availableQuantity when the selected candidate can't fully cover it (0 otherwise) - shown to the user BEFORE they decide anything. */
  shortfall: number;
  resolution: PantryMatchResolution;
  /** What will actually be deducted from the pantry item - 0 until a 'full' or 'partial' resolution is reached. */
  deductedQuantity: number;
  /** requiredQuantity - deductedQuantity, but ONLY meaningful (nonzero) once resolution === 'partial' - a confirmed admission that this much came from somewhere else. */
  uncoveredQuantity: number;
  matchConfidence: MatchConfidence;
}

function matchFacts(
  requiredQuantity: number,
  requiredUnit: string | undefined,
  ingredientId: string,
  candidate: PantryMatchCandidate | null | undefined,
): {
  pantryItemId?: string;
  availableQuantity?: number;
  pantryUnit?: string;
  unitsCompatible: boolean;
  shortfall: number;
  matchConfidence: MatchConfidence;
  autoResolution: 'unmatched' | 'incompatible' | 'sufficient' | 'insufficient';
} {
  if (!candidate || candidate.status !== 'active' || candidate.quantity <= 0) {
    return { pantryItemId: undefined, availableQuantity: undefined, pantryUnit: undefined, unitsCompatible: false, shortfall: 0, matchConfidence: 'none', autoResolution: 'unmatched' };
  }
  const unitsCompatible = !!requiredUnit && candidate.unit === requiredUnit;
  if (!unitsCompatible) {
    return { pantryItemId: candidate.id, availableQuantity: candidate.quantity, pantryUnit: candidate.unit, unitsCompatible: false, shortfall: 0, matchConfidence: 'uncertain', autoResolution: 'incompatible' };
  }
  const shortfall = round2(Math.max(0, requiredQuantity - candidate.quantity));
  const matchConfidence: MatchConfidence = candidate.ingredientId === ingredientId ? 'exact' : 'likely';
  return {
    pantryItemId: candidate.id,
    availableQuantity: candidate.quantity,
    pantryUnit: candidate.unit,
    unitsCompatible: true,
    shortfall,
    matchConfidence,
    autoResolution: shortfall > 0 ? 'insufficient' : 'sufficient',
  };
}

/**
 * Resolves a recipe ingredient against one specific candidate pantry item
 * (or none). Enough compatible stock resolves straight to 'full' (matches
 * "exact same-unit deduction may be automatic after explicit cooking
 * confirmation" - pressing Finish is that confirmation). Insufficient stock
 * NEVER auto-clamps to what's available and calls it done - it stops at
 * 'needs_decision', exposing the exact shortfall, and stays there until the
 * user explicitly calls confirmPartialDeduction or skipPantryDeduction, or
 * remaps to a different candidate (a fresh call to this function).
 */
export function autoResolvePantryMatch(
  requiredQuantity: number,
  requiredUnit: string | undefined,
  ingredientId: string,
  candidate: PantryMatchCandidate | null | undefined,
): PantryDeductionRowState {
  const match = matchFacts(requiredQuantity, requiredUnit, ingredientId, candidate);
  const base = {
    pantryItemId: match.pantryItemId,
    availableQuantity: match.availableQuantity,
    pantryUnit: match.pantryUnit,
    unitsCompatible: match.unitsCompatible,
    requiredQuantity,
    matchConfidence: match.matchConfidence,
    uncoveredQuantity: 0,
  };
  switch (match.autoResolution) {
    case 'unmatched':
      return { ...base, shortfall: 0, resolution: 'unmatched', deductedQuantity: 0 };
    case 'incompatible':
      return { ...base, shortfall: 0, resolution: 'incompatible', deductedQuantity: 0 };
    case 'sufficient':
      return { ...base, shortfall: 0, resolution: 'full', deductedQuantity: requiredQuantity };
    case 'insufficient':
      return { ...base, shortfall: match.shortfall, resolution: 'needs_decision', deductedQuantity: 0 };
  }
}

/**
 * Explicit user decision: deduct the available amount and acknowledge the
 * remainder (the shortfall) came from somewhere else. Only meaningful from
 * 'needs_decision' - a no-op otherwise, so it can never be called
 * accidentally to "confirm" a state that was never actually short.
 */
export function confirmPartialDeduction(state: PantryDeductionRowState): PantryDeductionRowState {
  if (state.resolution !== 'needs_decision' || state.availableQuantity == null) return state;
  return {
    ...state,
    resolution: 'partial',
    deductedQuantity: state.availableQuantity,
    uncoveredQuantity: round2(state.requiredQuantity - state.availableQuantity),
  };
}

/** Explicit user decision: don't deduct this ingredient from the pantry at all. */
export function skipPantryDeduction(state: PantryDeductionRowState): PantryDeductionRowState {
  return { ...state, resolution: 'skipped', deductedQuantity: 0, uncoveredQuantity: 0 };
}

/**
 * Recomputes the required quantity for a new servings-prepared amount and
 * re-resolves against the SAME candidate the row currently has (preserving
 * an intentional manual remap - never silently reverting to the auto-match).
 * A prior 'full' or 'partial' resolution is never carried forward as-is: it
 * is always recomputed fresh, so a 'partial' confirmation is invalidated and
 * must be explicitly reconfirmed if the new required quantity still isn't
 * fully covered (it only survives unprompted if the new amount now happens
 * to fit, which resolves straight to 'full', not a stale 'partial'). A
 * 'skipped' choice is deliberate and quantity-independent, so it survives.
 */
export function rescalePantryMatch(
  state: PantryDeductionRowState,
  newRequiredQuantity: number,
  requiredUnit: string | undefined,
  ingredientId: string,
  candidate: PantryMatchCandidate | null | undefined,
): PantryDeductionRowState {
  if (state.resolution === 'skipped') {
    const match = matchFacts(newRequiredQuantity, requiredUnit, ingredientId, candidate);
    return {
      pantryItemId: match.pantryItemId,
      availableQuantity: match.availableQuantity,
      pantryUnit: match.pantryUnit,
      unitsCompatible: match.unitsCompatible,
      requiredQuantity: newRequiredQuantity,
      shortfall: match.autoResolution === 'insufficient' ? match.shortfall : 0,
      resolution: 'skipped',
      deductedQuantity: 0,
      uncoveredQuantity: 0,
      matchConfidence: match.matchConfidence,
    };
  }
  return autoResolvePantryMatch(newRequiredQuantity, requiredUnit, ingredientId, candidate);
}

/** Active, in-stock, unit-compatible pantry items only - the sole set a remap picker may ever offer, so it can never let the user select an incompatible or depleted item. Note: "in-stock" here means > 0, not >= required - an insufficient-but-nonzero item is still a legitimate, selectable partial source. */
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
