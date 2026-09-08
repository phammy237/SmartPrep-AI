/**
 * FEFO (first-expiring, first-out) pantry-deduction PROPOSAL for the cooking
 * flow.
 *
 * This is MATH ONLY. It never persists, never mutates `pantry_items`, and never
 * decides anything on the user's behalf - it only proposes which pantry lots a
 * recipe ingredient should draw from, in the order they should be used, so the
 * Cooking Mode review screen can render a sensible default the user then
 * confirms or changes. The real deduction still happens exactly once, in
 * `complete_cooking_event`, from the user-reviewed payload.
 *
 * All FEFO / unit / quantity math is delegated to the single shared engine
 * (`lib/freshness/lotAllocation` + `lib/nutrition/conversion`) - the same one
 * the recommendation engine and `Generate My Week` use. This module adds only
 * the cooking-specific policy on top:
 *   - dated lots are always proposed before no-date lots (§ "unknown after known")
 *   - a requirement that cannot be compared to any lot's unit goes to review,
 *     never a fabricated conversion
 *   - explicit user decisions (partial / skip / manual lot choice) are modelled
 *     and preserved across a servings-prepared change
 */

import { INGREDIENTS_BY_ID, normalizeIngredientName } from '@/data';
import {
  ExpiringLot,
  ExpiryAssessment,
  ExpiryState,
  allocateIngredientRequirementToLots,
  assessPantryItemExpiry,
  fefoSortExpiringLots,
  isUrgentExpiryState,
} from '@/lib/freshness';
import { IngredientConversionMeta, convertQuantity } from '@/lib/nutrition/conversion';
import { normalizeUnit } from '@/lib/nutrition/units';
import { ExpirationConfidence, PantryItem } from '@/types';

const EPS = 0.001;

// ---------------------------------------------------------------------------
// Pantry lots for the cooking flow (keeps the pantry_items.id + expiry that
// the recommendation-side PantryLot deliberately drops).
// ---------------------------------------------------------------------------

export interface CookingPantryLot {
  pantryItemId: string;
  ingredientId: string;
  name: string;
  /** Current live stock, in `unit`. */
  quantity: number;
  unit: string;
  expiry: ExpiryAssessment;
  expirationConfidence?: ExpirationConfidence;
}

export interface CookingPantryIndex {
  /** canonical ingredient id -> its lots (SAME lot objects also live in `byName`). */
  byId: Map<string, CookingPantryLot[]>;
  /** normalized-name fallback, only consulted for recipe ingredients with no catalog id. */
  byName: Map<string, CookingPantryLot[]>;
}

/**
 * Group active, in-stock pantry lots by canonical ingredient id and (for the
 * no-catalog-id fallback) by normalized name - the exact same matching rule as
 * `lib/nutrition/pantryLots` and `lib/planner/virtualPantry`. Depleted /
 * zero-quantity lots are excluded.
 */
export function buildCookingPantryIndex(
  pantry: PantryItem[],
  timeZone: string,
  now: Date,
): CookingPantryIndex {
  const byId = new Map<string, CookingPantryLot[]>();
  const byName = new Map<string, CookingPantryLot[]>();
  const push = (m: Map<string, CookingPantryLot[]>, k: string, lot: CookingPantryLot) => {
    const a = m.get(k);
    if (a) a.push(lot);
    else m.set(k, [lot]);
  };

  for (const item of pantry) {
    if (item.status === 'depleted') continue;
    if (!(typeof item.quantity === 'number' && item.quantity > 0)) continue;
    const lot: CookingPantryLot = {
      pantryItemId: item.id,
      ingredientId: item.ingredientId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expiry: assessPantryItemExpiry(item, timeZone, now),
      expirationConfidence: item.expirationConfidence,
    };
    push(byId, item.ingredientId, lot);
    const nn = item.normalizedName ?? normalizeIngredientName(item.name);
    if (nn) push(byName, nn, lot);
  }
  return { byId, byName };
}

/** Canonical id first; exact normalized-name fallback only when the ingredient has no catalog id. Never fuzzy. */
export function cookingLotsForIngredient(
  ingredient: { ingredientId: string; name: string },
  index: CookingPantryIndex,
): CookingPantryLot[] {
  const byId = index.byId.get(ingredient.ingredientId);
  if (byId && byId.length > 0) return byId;
  if (!INGREDIENTS_BY_ID[ingredient.ingredientId]) {
    return index.byName.get(normalizeIngredientName(ingredient.name)) ?? [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Proposal model
// ---------------------------------------------------------------------------

export type IngredientDeductionStatus =
  /** Proposed allocations fully cover the (scaled) requirement. Auto-submittable once the user presses Finish. */
  | 'ready'
  /** Compatible lots exist but do not fully cover the requirement, and the user has not decided what to do. Never auto-submittable. */
  | 'needs_decision'
  /** The user explicitly accepted a partial deduction - deduct exactly what the lots cover, the rest is acknowledged as sourced elsewhere. */
  | 'partial'
  /** The user explicitly chose not to deduct this ingredient from the pantry. */
  | 'skipped'
  /** No compatible pantry lot exists for this ingredient at all. */
  | 'unmatched'
  /** A lot for this ingredient exists but its unit cannot be compared to the recipe's unit (no density / per-unit weight). Requires user review - never a fabricated conversion. */
  | 'unresolved_unit';

export interface ProposedAllocation {
  pantryItemId: string;
  pantryItemName: string;
  /** Lot's current live stock, in `unit`. */
  availableQuantity: number;
  /** The pantry lot's own unit - `proposedDeduction` and `availableQuantity` are in this unit, and this is what `complete_cooking_event` validates against. */
  unit: string;
  /** How much to take from THIS lot, in `unit`. */
  proposedDeduction: number;
  /** The same draw expressed in the plan's `coveredUnit` (requirement unit, or 'g') - for the "100 g from 0.5 kg" card copy. */
  coveredAmount: number;
  /** Unit `coveredAmount` is in (mirrors `IngredientDeductionPlan.coveredUnit`). */
  coveredUnit: string;
  freshnessState: ExpiryState;
  expirationDate?: string;
  expirationConfidence?: ExpirationConfidence;
  /** True only for a user-provided printed date (confidence 'high'). */
  isUserConfirmedDate: boolean;
  /** Whole calendar days to the tracked date; negative = past; undefined when no tracked date. */
  daysUntilExpiry?: number;
  /** Honest short phrase for the UI ("Expires tomorrow", "No tracked date", ...). Reused verbatim from the freshness engine - never a safety verdict. */
  freshnessPhrase: string;
  /** 'exact' when the lot's canonical ingredient id matches the recipe ingredient; 'likely' when matched only by normalized name. */
  matchConfidence: 'exact' | 'likely';
}

export interface IngredientDeductionPlan {
  recipeIngredientId: string;
  ingredientId: string;
  ingredientName: string;
  /** Requirement scaled to the servings actually being prepared. */
  requiredQuantity: number;
  requiredUnit?: string;
  status: IngredientDeductionStatus;
  /** FEFO-ordered proposed lot draws. Empty for skipped / unmatched / unresolved_unit. */
  allocations: ProposedAllocation[];
  /** Unit that `coveredQuantity` / `uncoveredQuantity` are expressed in (the requirement unit, or 'g' on the grams path). */
  coveredUnit: string;
  coveredQuantity: number;
  /** Requirement not met by the proposed lots (in `coveredUnit`). 0 when fully covered. */
  uncoveredQuantity: number;
  unresolvedReason?: 'unit_mismatch' | 'lot_unavailable';
  /** True when FEFO ordering meaningfully shaped the proposal (an urgent lot is used, or the draw spans multiple lots) - drives the subtle "SmartPrep selected the items that should be used first" line. */
  fefoApplied: boolean;
  /** True once the user has hand-picked the lot(s) - a servings change must re-run against THEIR choice, not silently revert to the auto FEFO pick. */
  manualOverride: boolean;
  /** The lot ids the user picked (manual override only). This - not the derived allocations - is the durable manual intent that survives a servings change. */
  manualLotIds?: string[];
  /** Picked lot ids that are no longer in the pantry (removed / depleted). Forces `needs_decision` - never a silent substitution. */
  missingSelectedLotIds?: string[];
}

interface ProposeArgs {
  recipeIngredientId: string;
  ingredientId: string;
  ingredientName: string;
  requiredQuantity: number;
  requiredUnit?: string;
  lots: CookingPantryLot[];
  conversionMeta?: IngredientConversionMeta;
  /** Manual override: restrict the proposal to exactly these lot ids, in FEFO order. */
  restrictToLotIds?: string[];
  manualOverride?: boolean;
}

function toExpiringLot(l: CookingPantryLot): ExpiringLot {
  return { lotId: l.pantryItemId, quantity: l.quantity, unit: l.unit, expiry: l.expiry };
}

function allocationFromLotUse(
  lot: CookingPantryLot,
  takenInLotUnit: number,
  takenInCoveredUnit: number,
  coveredUnit: string,
  ingredientId: string,
): ProposedAllocation {
  return {
    pantryItemId: lot.pantryItemId,
    pantryItemName: lot.name,
    availableQuantity: lot.quantity,
    unit: lot.unit,
    proposedDeduction: takenInLotUnit,
    coveredAmount: round3(takenInCoveredUnit),
    coveredUnit,
    freshnessState: lot.expiry.state,
    expirationDate: lot.expiry.expirationDate,
    expirationConfidence: lot.expirationConfidence,
    isUserConfirmedDate: lot.expiry.isUserConfirmedDate,
    daysUntilExpiry: lot.expiry.daysUntilExpiry ?? undefined,
    freshnessPhrase: lot.expiry.phrase,
    matchConfidence: lot.ingredientId === ingredientId ? 'exact' : 'likely',
  };
}

/**
 * Propose the FEFO pantry draw for one recipe ingredient.
 *
 * Dated lots (expired / critical / use-soon / fresh) are always offered before
 * no-date lots: the shared allocator is run once over the dated lots, then - if
 * anything is still needed - again over the no-date lots. Within each pass the
 * shared engine's FEFO order applies (soonest-expiring first, ties broken by
 * lot id, fully deterministic).
 */
export function proposeIngredientDeduction(args: ProposeArgs): IngredientDeductionPlan {
  const {
    recipeIngredientId,
    ingredientId,
    ingredientName,
    requiredQuantity,
    requiredUnit,
    conversionMeta,
    restrictToLotIds,
    manualOverride = false,
  } = args;

  let lots = args.lots;
  let missingSelectedLotIds: string[] | undefined;
  if (restrictToLotIds) {
    const wanted = new Set(restrictToLotIds);
    lots = lots.filter((l) => wanted.has(l.pantryItemId));
    const present = new Set(lots.map((l) => l.pantryItemId));
    const missing = restrictToLotIds.filter((id) => !present.has(id));
    if (missing.length > 0) missingSelectedLotIds = missing;
  }

  const base = {
    recipeIngredientId,
    ingredientId,
    ingredientName,
    requiredQuantity,
    requiredUnit,
    manualOverride,
    manualLotIds: manualOverride && restrictToLotIds ? restrictToLotIds : undefined,
    missingSelectedLotIds,
  };

  if (!(requiredQuantity > 0)) {
    // Nothing to take - treat as an explicit no-op rather than a zero-quantity deduction.
    return {
      ...base,
      status: 'skipped',
      allocations: [],
      coveredUnit: requiredUnit ?? '',
      coveredQuantity: 0,
      uncoveredQuantity: 0,
      fefoApplied: false,
    };
  }

  if (lots.length === 0) {
    // A manual selection whose every lot has since vanished must go back to a
    // decision, never silently fall through to "nothing to deduct".
    const status = missingSelectedLotIds ? 'needs_decision' : 'unmatched';
    return {
      ...base,
      status,
      allocations: [],
      coveredUnit: requiredUnit ?? '',
      coveredQuantity: 0,
      uncoveredQuantity: requiredQuantity,
      unresolvedReason: missingSelectedLotIds ? 'lot_unavailable' : undefined,
      fefoApplied: false,
    };
  }

  const lotById = new Map(lots.map((l) => [l.pantryItemId, l]));
  const dated = lots.filter((l) => l.expiry.state !== 'unknown');
  const undated = lots.filter((l) => l.expiry.state === 'unknown');

  const unit = requiredUnit ?? '';
  const allocations: ProposedAllocation[] = [];
  let anyUnresolved = false;
  let coveredUnit = unit;
  let coveredQuantity = 0;
  let remainder = requiredQuantity;

  const runPass = (passLots: CookingPantryLot[], need: number, needUnit: string) => {
    if (passLots.length === 0 || !(need > EPS)) return;
    const alloc = allocateIngredientRequirementToLots(
      need,
      needUnit,
      passLots.map(toExpiringLot),
      conversionMeta,
    );
    if (alloc.quantityUnresolved) {
      anyUnresolved = true;
      return;
    }
    coveredUnit = alloc.coveredUnit;
    for (const use of alloc.lotsUsed) {
      const lot = lotById.get(use.lotId);
      if (!lot || !(use.lotUnitTaken > 0)) continue;
      allocations.push(
        allocationFromLotUse(lot, use.lotUnitTaken, use.takenQuantity, alloc.coveredUnit, ingredientId),
      );
      coveredQuantity += use.takenQuantity;
    }
    remainder = alloc.unresolvedRemainder;
  };

  runPass(dated, remainder, unit);
  if (remainder > EPS && !anyUnresolved) {
    runPass(undated, remainder, coveredUnit);
  }

  coveredQuantity = round3(coveredQuantity);
  const uncoveredQuantity = round3(Math.max(0, remainder));
  const fefoApplied =
    allocations.length > 1 || allocations.some((a) => isUrgentExpiryState(a.freshnessState));

  if (allocations.length === 0) {
    // Lots existed for this ingredient but none could be compared to the
    // requirement's unit - review required, never a guessed conversion.
    if (anyUnresolved) {
      return {
        ...base,
        status: 'unresolved_unit',
        allocations: [],
        coveredUnit: unit,
        coveredQuantity: 0,
        uncoveredQuantity: requiredQuantity,
        unresolvedReason: 'unit_mismatch',
        fefoApplied: false,
      };
    }
    return {
      ...base,
      status: 'unmatched',
      allocations: [],
      coveredUnit: unit,
      coveredQuantity: 0,
      uncoveredQuantity: requiredQuantity,
      fefoApplied: false,
    };
  }

  // A vanished picked lot always drops back to a decision, even if the lots
  // that remain happen to cover the amount - the user must re-acknowledge.
  const status: IngredientDeductionStatus =
    missingSelectedLotIds || uncoveredQuantity > EPS ? 'needs_decision' : 'ready';

  return {
    ...base,
    status,
    allocations,
    coveredUnit,
    coveredQuantity,
    uncoveredQuantity,
    unresolvedReason: missingSelectedLotIds ? 'lot_unavailable' : anyUnresolved ? 'unit_mismatch' : undefined,
    fefoApplied,
  };
}

/**
 * Explicit user decision from `needs_decision`: accept the proposed partial
 * draw and acknowledge the shortfall came from elsewhere. A no-op from any
 * other status, so it can never fabricate a "partial" out of a state that was
 * never actually short.
 */
export function applyPartialConfirmation(plan: IngredientDeductionPlan): IngredientDeductionPlan {
  if (plan.status !== 'needs_decision' || plan.allocations.length === 0) return plan;
  return { ...plan, status: 'partial' };
}

/** Explicit user decision: don't deduct this ingredient from the pantry at all. */
export function applySkip(plan: IngredientDeductionPlan): IngredientDeductionPlan {
  return {
    ...plan,
    status: 'skipped',
    allocations: [],
    coveredQuantity: 0,
    uncoveredQuantity: 0,
  };
}

/**
 * Recompute a plan for a new servings-prepared amount.
 *   - a deliberate skip survives (it is quantity-independent)
 *   - a manual lot choice is re-run against THOSE lots only, never silently
 *     reverted to the auto FEFO pick
 *   - everything else is recomputed fresh, so a stale `partial` confirmation is
 *     dropped and must be re-made if the new amount is still short
 */
export function rescaleForServings(
  plan: IngredientDeductionPlan,
  newRequiredQuantity: number,
  lots: CookingPantryLot[],
  conversionMeta?: IngredientConversionMeta,
): IngredientDeductionPlan {
  if (plan.status === 'skipped') {
    return { ...plan, requiredQuantity: newRequiredQuantity, allocations: [], coveredQuantity: 0, uncoveredQuantity: 0 };
  }
  const restrictToLotIds = plan.manualOverride
    ? plan.manualLotIds ?? plan.allocations.map((a) => a.pantryItemId)
    : undefined;
  return proposeIngredientDeduction({
    recipeIngredientId: plan.recipeIngredientId,
    ingredientId: plan.ingredientId,
    ingredientName: plan.ingredientName,
    requiredQuantity: newRequiredQuantity,
    requiredUnit: plan.requiredUnit,
    lots,
    conversionMeta,
    restrictToLotIds,
    manualOverride: plan.manualOverride,
  });
}

// ---------------------------------------------------------------------------
// Manual picker: describe every matching lot (compatible units included)
// ---------------------------------------------------------------------------

export interface SelectableLot {
  pantryItemId: string;
  name: string;
  /** Live stock, in `unit` (the lot's own stored unit). */
  availableQuantity: number;
  unit: string;
  /** `availableQuantity` expressed in the recipe's unit, when that conversion is deterministic AND the units differ. For the "≈ 500 g" preview only. */
  approxInRequiredUnit?: number;
  requiredUnit?: string;
  /** The lot's stored unit can be deterministically compared to the requirement. */
  convertible: boolean;
  /** v1: only convertible lots may be picked; an unresolved lot is shown honestly but disabled. */
  selectable: boolean;
  unresolvedReason?: 'unit_mismatch';
  freshnessState: ExpiryState;
  freshnessPhrase: string;
  daysUntilExpiry?: number;
  isUserConfirmedDate: boolean;
  selected: boolean;
}

/**
 * Build the manual-picker rows for one recipe ingredient: every matching active
 * lot, FEFO-ordered, each marked selectable iff its unit converts deterministically
 * to the recipe's unit. The picker renders these verbatim - it never runs
 * conversion math itself.
 */
export function describeSelectableLots(args: {
  requiredUnit?: string;
  lots: CookingPantryLot[];
  conversionMeta?: IngredientConversionMeta;
  selectedLotIds: string[];
}): SelectableLot[] {
  const { requiredUnit, lots, conversionMeta, selectedLotIds } = args;
  const selected = new Set(selectedLotIds);
  const byId = new Map(lots.map((l) => [l.pantryItemId, l]));
  // Same order the allocator will consume in: every dated lot (FEFO), then the
  // no-date lots last.
  const order = (subset: CookingPantryLot[]) =>
    fefoSortExpiringLots(subset.map(toExpiringLot))
      .map((l) => byId.get(l.lotId))
      .filter((l): l is CookingPantryLot => l !== undefined);
  const ordered = [
    ...order(lots.filter((l) => l.expiry.state !== 'unknown')),
    ...order(lots.filter((l) => l.expiry.state === 'unknown')),
  ];

  const reqKey = requiredUnit ? normalizeUnit(requiredUnit) : null;

  return ordered.map((lot) => {
    const conv = requiredUnit
      ? convertQuantity({ quantity: lot.quantity, fromUnit: lot.unit, toUnit: requiredUnit, meta: conversionMeta })
      : ({ status: 'unresolved', reason: 'unsupported_unit' } as const);
    const convertible = conv.status === 'converted';
    const differsFromRequired = !!reqKey && (normalizeUnit(lot.unit) ?? lot.unit) !== reqKey;
    return {
      pantryItemId: lot.pantryItemId,
      name: lot.name,
      availableQuantity: lot.quantity,
      unit: lot.unit,
      approxInRequiredUnit: conv.status === 'converted' && differsFromRequired ? conv.value : undefined,
      requiredUnit,
      convertible,
      selectable: convertible,
      unresolvedReason: convertible ? undefined : 'unit_mismatch',
      freshnessState: lot.expiry.state,
      freshnessPhrase: lot.expiry.phrase,
      daysUntilExpiry: lot.expiry.daysUntilExpiry ?? undefined,
      isUserConfirmedDate: lot.expiry.isUserConfirmedDate,
      selected: selected.has(lot.pantryItemId),
    };
  });
}

// ---------------------------------------------------------------------------
// Post-cook urgency summary (derived from the ACTUAL confirmed allocations)
// ---------------------------------------------------------------------------

export interface ConfirmedDeductionForSummary {
  ingredientName: string;
  expiryState: ExpiryState;
  /** The exact freshness phrase for this lot (reused verbatim - never re-worded). */
  freshnessPhrase: string;
  /** Amount actually deducted from this lot (any unit). Zero / negative entries are ignored. */
  deductedQuantity: number;
}

/**
 * A short, factual line about the expiring stock a cook actually used. Built
 * from the confirmed per-lot deductions, so a user override that swapped an
 * urgent lot for a fresh one changes the sentence. Returns null when nothing
 * urgent was deducted. Never claims "waste avoided" / "food saved".
 *
 * Urgent = expired | critical | use_soon. fresh and unknown never count.
 */
export function summarizeUrgentDeductions(deductions: ConfirmedDeductionForSummary[]): string | null {
  const urgent = deductions.filter((d) => d.deductedQuantity > 0 && isUrgentExpiryState(d.expiryState));
  if (urgent.length === 0) return null;
  if (urgent.length === 1) {
    return `Used ${urgent[0].ingredientName} · ${urgent[0].freshnessPhrase}.`;
  }
  return `You used ${urgent.length} pantry items that were due soon.`;
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
