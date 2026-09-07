/**
 * Recommendation-only FEFO (first-expiring, first-out) allocation of a recipe
 * ingredient requirement against the user's pantry lots.
 *
 * This is MATH ONLY - it never persists anything and never reorders the
 * pantry. Actual cooking deduction stays governed by the cooking-confirmation
 * flow. It answers, for the recommendation engine:
 *
 *   "If we cooked this now, how much of what's about to expire would it use?"
 *
 * All unit conversion goes through the shared engine (lib/nutrition/conversion).
 * When lot/recipe units can't be compared safely, the relationship is reported
 * as `quantityUnresolved` rather than fabricated.
 */

import { IngredientConversionMeta, resolveQuantityToGrams, roundGrams } from '@/lib/nutrition/conversion';
import { normalizeUnit } from '@/lib/nutrition/units';
import { ExpiryAssessment, ExpiryState, expiryStateRank, isUrgentExpiryState } from './expiryModel';

export interface ExpiringLot {
  /** Stable id (the pantry_items.id). Used only for deterministic tie-breaks + UI. */
  lotId: string;
  quantity: number;
  unit: string;
  expiry: ExpiryAssessment;
}

export interface LotUse {
  lotId: string;
  /** Amount taken, expressed in `LotAllocation.coveredUnit` (the requirement unit, or 'g' on the grams path). */
  takenQuantity: number;
  unit: string;
  expiryState: ExpiryState;
  /**
   * Same amount taken, expressed in THIS lot's own unit. Equal to `takenQuantity`
   * on the same-unit path; back-converted proportionally on the grams path.
   * Lets a caller (e.g. planner virtual pantry) decrement the lot without a
   * second conversion.
   */
  lotUnitTaken: number;
}

export interface LotAllocation {
  /** Amount of the requirement met by available lots, in `coveredUnit`. */
  coveredQuantity: number;
  /** The unit `coveredQuantity` / `urgentQuantityUtilized` / `unresolvedRemainder` are expressed in. */
  coveredUnit: string;
  /** Of `coveredQuantity`, how much came from lots in expired/critical/use_soon state. */
  urgentQuantityUtilized: number;
  /** Lots consumed, FEFO order, with the amount taken from each. */
  lotsUsed: LotUse[];
  /** Requirement still unmet by available lots, in `coveredUnit`. 0 when fully covered. */
  unresolvedRemainder: number;
  /** True when a unit mismatch prevented any real quantity comparison. */
  quantityUnresolved: boolean;
  /** True when at least one FEFO-earlier lot in an urgent state exists for this ingredient. */
  hasUrgentLot: boolean;
}

function positive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * FEFO sort: soonest-expiring first. `daysUntilExpiry` null (unknown) sorts
 * after all dated lots. Ties broken by `lotId` so the result never depends on
 * input array order.
 */
function fefoSort(lots: ExpiringLot[]): ExpiringLot[] {
  return [...lots].sort((a, b) => {
    const ra = expiryStateRank(a.expiry.state);
    const rb = expiryStateRank(b.expiry.state);
    if (ra !== rb) return ra - rb;
    const da = a.expiry.daysUntilExpiry;
    const db = b.expiry.daysUntilExpiry;
    if (da !== null && db !== null && da !== db) return da - db;
    if (da === null && db !== null) return 1;
    if (db === null && da !== null) return -1;
    return a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0;
  });
}

function emptyAllocation(unit: string, remainder: number, hasUrgentLot: boolean, unresolved: boolean): LotAllocation {
  return {
    coveredQuantity: 0,
    coveredUnit: unit,
    urgentQuantityUtilized: 0,
    lotsUsed: [],
    unresolvedRemainder: remainder,
    quantityUnresolved: unresolved,
    hasUrgentLot,
  };
}

/**
 * @param requiredQuantity  recipe requirement (already servings-scaled by the caller)
 * @param requiredUnit      recipe requirement unit
 * @param lots              pantry lots for ONE canonical ingredient, already filtered
 *                          to active / in-stock (positive quantity)
 * @param conversionMeta    per-ingredient density / per-unit weight, if known
 */
export function allocateIngredientRequirementToLots(
  requiredQuantity: number,
  requiredUnit: string,
  lots: ExpiringLot[],
  conversionMeta?: IngredientConversionMeta,
): LotAllocation {
  const usable = lots.filter((l) => positive(l.quantity));
  const hasUrgentLot = usable.some((l) => isUrgentExpiryState(l.expiry.state));
  const reqKey = normalizeUnit(requiredUnit) ?? requiredUnit;

  if (usable.length === 0) {
    return emptyAllocation(reqKey, positive(requiredQuantity) ? requiredQuantity : 0, false, false);
  }
  if (!positive(requiredQuantity)) {
    return emptyAllocation(reqKey, 0, hasUrgentLot, true);
  }

  const ordered = fefoSort(usable);

  // ---- Same-unit path (no metadata needed; works for count units too) ----
  if (ordered.every((l) => (normalizeUnit(l.unit) ?? l.unit) === reqKey)) {
    return walk(
      ordered,
      requiredQuantity,
      reqKey,
      (l) => l.quantity,
      (_l, taken) => taken, // same unit -> lot-unit amount equals covered-unit amount
      hasUrgentLot,
    );
  }

  // ---- Grams path (every quantity must resolve to grams) ----
  const reqG = resolveQuantityToGrams(requiredQuantity, requiredUnit, conversionMeta);
  const lotG = ordered.map((l) => ({ lot: l, g: resolveQuantityToGrams(l.quantity, l.unit, conversionMeta) }));
  if (reqG.status === 'converted' && lotG.every((x) => x.g.status === 'converted')) {
    return walk(
      lotG.map((x) => x.lot),
      reqG.grams,
      'g',
      (l) => {
        const found = lotG.find((x) => x.lot.lotId === l.lotId);
        return found && found.g.status === 'converted' ? found.g.grams : 0;
      },
      (l, takenGrams) => {
        const found = lotG.find((x) => x.lot.lotId === l.lotId);
        const lotGrams = found && found.g.status === 'converted' ? found.g.grams : 0;
        // proportional back-conversion (all supported conversions are linear)
        return lotGrams > 0 ? roundGrams((takenGrams * l.quantity) / lotGrams) : 0;
      },
      hasUrgentLot,
    );
  }

  // ---- Incompatible units: identity match only, no fabricated quantity ----
  return emptyAllocation(reqKey, requiredQuantity, hasUrgentLot, true);
}

/** Walk FEFO-ordered lots, taking from each until the requirement is met. */
function walk(
  ordered: ExpiringLot[],
  required: number,
  unit: string,
  lotAmount: (l: ExpiringLot) => number,
  lotUnitAmount: (l: ExpiringLot, takenInCoveredUnit: number) => number,
  hasUrgentLot: boolean,
): LotAllocation {
  let remaining = required;
  let covered = 0;
  let urgentUsed = 0;
  const lotsUsed: LotUse[] = [];

  for (const lot of ordered) {
    if (remaining <= 0) break;
    const avail = lotAmount(lot);
    if (!positive(avail)) continue;
    const taken = roundGrams(Math.min(remaining, avail));
    if (taken <= 0) continue;
    remaining = roundGrams(remaining - taken);
    covered = roundGrams(covered + taken);
    if (isUrgentExpiryState(lot.expiry.state)) urgentUsed = roundGrams(urgentUsed + taken);
    lotsUsed.push({
      lotId: lot.lotId,
      takenQuantity: taken,
      unit,
      expiryState: lot.expiry.state,
      lotUnitTaken: roundGrams(Math.min(lot.quantity, lotUnitAmount(lot, taken))),
    });
  }

  return {
    coveredQuantity: covered,
    coveredUnit: unit,
    urgentQuantityUtilized: urgentUsed,
    lotsUsed,
    unresolvedRemainder: roundGrams(Math.max(0, remaining)),
    quantityUnresolved: false,
    hasUrgentLot,
  };
}
