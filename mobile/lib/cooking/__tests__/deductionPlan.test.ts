import { assessPantryItemExpiry } from '@/lib/freshness';
import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import { PantryItem } from '@/types';
import {
  CookingPantryLot,
  applyPartialConfirmation,
  applySkip,
  buildCookingPantryIndex,
  cookingLotsForIngredient,
  describeSelectableLots,
  proposeIngredientDeduction,
  rescaleForServings,
  summarizeUrgentDeductions,
} from '../deductionPlan';

const NOW = new Date('2026-06-10T12:00:00Z'); // today (UTC) = 2026-06-10
const TZ = 'UTC';

const CHICKEN = 'ing-chicken-breast';

function lot(over: Partial<CookingPantryLot> & { pantryItemId: string }): CookingPantryLot {
  return {
    pantryItemId: over.pantryItemId,
    ingredientId: over.ingredientId ?? CHICKEN,
    name: over.name ?? 'Chicken Breast',
    quantity: over.quantity ?? 100,
    unit: over.unit ?? 'g',
    expiry: over.expiry ?? assessPantryItemExpiry({}, TZ, NOW),
    expirationConfidence: over.expirationConfidence,
  };
}

/** Convenience: a lot with a tracked expiration date. */
function datedLot(
  pantryItemId: string,
  quantity: number,
  date: string,
  confidence: 'high' | 'medium' = 'high',
  over: Partial<CookingPantryLot> = {},
): CookingPantryLot {
  return lot({
    pantryItemId,
    quantity,
    expiry: assessPantryItemExpiry({ estimatedExpirationDate: date, expirationConfidence: confidence }, TZ, NOW),
    expirationConfidence: confidence,
    ...over,
  });
}

function propose(lots: CookingPantryLot[], requiredQuantity: number, requiredUnit = 'g', conversionMeta?: IngredientConversionMeta) {
  return proposeIngredientDeduction({
    recipeIngredientId: 'ri-1',
    ingredientId: CHICKEN,
    ingredientName: 'Chicken Breast',
    requiredQuantity,
    requiredUnit,
    lots,
    conversionMeta,
  });
}

// ---------------------------------------------------------------------------
// FEFO proposal (§22)
// ---------------------------------------------------------------------------

describe('proposeIngredientDeduction - FEFO ordering', () => {
  it('one matching lot that covers the requirement -> ready, single allocation', () => {
    const plan = propose([datedLot('L1', 500, '2026-06-25')], 300);
    expect(plan.status).toBe('ready');
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0]).toMatchObject({ pantryItemId: 'L1', proposedDeduction: 300, unit: 'g' });
    expect(plan.uncoveredQuantity).toBe(0);
  });

  it('a requirement that spans multiple lots is split across them, earliest-expiring first', () => {
    // Lot A: 200 g expires tomorrow (critical). Lot B: 500 g expires next week (fresh).
    const plan = propose([datedLot('B', 500, '2026-06-25'), datedLot('A', 200, '2026-06-11')], 300);
    expect(plan.status).toBe('ready');
    expect(plan.allocations.map((a) => a.pantryItemId)).toEqual(['A', 'B']);
    expect(plan.allocations[0].proposedDeduction).toBe(200); // urgent lot fully used first
    expect(plan.allocations[1].proposedDeduction).toBe(100); // remainder from the fresh lot
    expect(plan.fefoApplied).toBe(true);
  });

  it('the earliest-expiring lot is completely used before a fresher one is touched', () => {
    const plan = propose(
      [datedLot('fresh', 1000, '2026-07-01'), datedLot('critical', 150, '2026-06-11'), datedLot('soon', 150, '2026-06-13')],
      200,
    );
    expect(plan.allocations.map((a) => a.pantryItemId)).toEqual(['critical', 'soon']);
    expect(plan.allocations[0].proposedDeduction).toBe(150); // critical drained
    expect(plan.allocations[1].proposedDeduction).toBe(50); // then soonest of the rest
  });

  it('no-date lots are proposed only after every dated lot (even fresh ones)', () => {
    const plan = propose([lot({ pantryItemId: 'nodate', quantity: 500 }), datedLot('fresh', 100, '2026-06-28')], 300);
    expect(plan.allocations.map((a) => a.pantryItemId)).toEqual(['fresh', 'nodate']);
    expect(plan.allocations[0].proposedDeduction).toBe(100);
    expect(plan.allocations[1].proposedDeduction).toBe(200);
  });

  it('deterministic tie-break by lot id when two lots share expiry state and date', () => {
    const a = propose([datedLot('zzz', 100, '2026-06-13'), datedLot('aaa', 100, '2026-06-13')], 150);
    const b = propose([datedLot('aaa', 100, '2026-06-13'), datedLot('zzz', 100, '2026-06-13')], 150);
    expect(a.allocations.map((x) => x.pantryItemId)).toEqual(['aaa', 'zzz']);
    expect(b.allocations.map((x) => x.pantryItemId)).toEqual(['aaa', 'zzz']);
  });

  it('an expired lot sorts first and carries the "check before using" phrase (never a safety verdict)', () => {
    const plan = propose([datedLot('good', 500, '2026-06-25'), datedLot('past', 100, '2026-06-08')], 200);
    expect(plan.allocations[0].pantryItemId).toBe('past');
    expect(plan.allocations[0].freshnessState).toBe('expired');
    expect(plan.allocations[0].freshnessPhrase).toBe('Past its date — check before using');
  });

  it('confirmed vs estimated dates get factual vs tentative phrasing', () => {
    const confirmed = propose([datedLot('c', 300, '2026-06-11', 'high')], 100);
    const estimated = propose([datedLot('e', 300, '2026-06-11', 'medium')], 100);
    expect(confirmed.allocations[0].freshnessPhrase).toBe('Expires tomorrow');
    expect(confirmed.allocations[0].isUserConfirmedDate).toBe(true);
    expect(estimated.allocations[0].freshnessPhrase).toBe('Estimated to expire tomorrow');
    expect(estimated.allocations[0].isUserConfirmedDate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quantity / unit handling (§23)
// ---------------------------------------------------------------------------

describe('proposeIngredientDeduction - units', () => {
  it('same unit, exact cover', () => {
    expect(propose([datedLot('L1', 250, '2026-06-25')], 250).status).toBe('ready');
  });

  it('g requirement drawn from a kg lot (mass<->mass always converts)', () => {
    const plan = propose([datedLot('kg', 1, '2026-06-25', 'high', { unit: 'kg' })], 300, 'g');
    expect(plan.status).toBe('ready');
    expect(plan.allocations[0].unit).toBe('kg');
    expect(plan.allocations[0].proposedDeduction).toBeCloseTo(0.3, 5); // decrement the lot in ITS unit
  });

  it('lb requirement drawn from an oz lot', () => {
    const plan = propose([datedLot('oz', 32, '2026-06-25', 'high', { unit: 'oz' })], 1, 'lb');
    expect(plan.status).toBe('ready');
    expect(plan.allocations[0].unit).toBe('oz');
    expect(plan.allocations[0].proposedDeduction).toBeCloseTo(16, 3);
  });

  it('density-backed volume <-> mass conversion', () => {
    const plan = propose([datedLot('g', 600, '2026-06-25', 'high', { unit: 'g' })], 500, 'ml', { densityGPerMl: 1 });
    expect(plan.status).toBe('ready');
    expect(plan.allocations[0].proposedDeduction).toBeCloseTo(500, 3);
  });

  it('count <-> mass conversion when per-unit weight metadata exists', () => {
    const plan = propose([datedLot('items', 5, '2026-06-25', 'high', { unit: 'item' })], 300, 'g', { gramsPerUnit: { item: 150 } });
    expect(plan.status).toBe('ready');
    expect(plan.allocations[0].unit).toBe('item');
    expect(plan.allocations[0].proposedDeduction).toBeCloseTo(2, 3); // 300 g / 150 g-per-item
  });

  it('incompatible units with no metadata -> unresolved_unit (review required, no fabricated conversion)', () => {
    const plan = propose([datedLot('bag', 1, '2026-06-11', 'high', { unit: 'bag' })], 300, 'g');
    expect(plan.status).toBe('unresolved_unit');
    expect(plan.unresolvedReason).toBe('unit_mismatch');
    expect(plan.allocations).toHaveLength(0);
    expect(plan.uncoveredQuantity).toBe(300);
  });

  it('2 cups spinach vs 300 g spinach with no density -> unresolved_unit, not a silent 1 cup = 150 g', () => {
    const plan = proposeIngredientDeduction({
      recipeIngredientId: 'ri-sp',
      ingredientId: 'ing-spinach',
      ingredientName: 'Spinach',
      requiredQuantity: 2,
      requiredUnit: 'cup',
      lots: [lot({ pantryItemId: 'sp', ingredientId: 'ing-spinach', name: 'Spinach', quantity: 300, unit: 'g' })],
    });
    expect(plan.status).toBe('unresolved_unit');
  });

  it('total stock across lots is below the requirement -> needs_decision with the exact shortfall', () => {
    const plan = propose([datedLot('a', 200, '2026-06-11'), datedLot('b', 100, '2026-06-25')], 500);
    expect(plan.status).toBe('needs_decision');
    expect(plan.allocations.map((a) => a.proposedDeduction)).toEqual([200, 100]);
    expect(plan.uncoveredQuantity).toBe(200);
  });

  it('zero-quantity / depleted lots never appear (excluded by the index builder)', () => {
    const items: PantryItem[] = [
      pantryItem({ id: 'z', quantity: 0 }),
      pantryItem({ id: 'd', quantity: 100, status: 'depleted' }),
      pantryItem({ id: 'ok', quantity: 200 }),
    ];
    const index = buildCookingPantryIndex(items, TZ, NOW);
    expect(cookingLotsForIngredient({ ingredientId: CHICKEN, name: 'Chicken Breast' }, index).map((l) => l.pantryItemId)).toEqual(['ok']);
  });

  it('no compatible lot at all -> unmatched', () => {
    const plan = proposeIngredientDeduction({
      recipeIngredientId: 'ri-x',
      ingredientId: 'ing-nope',
      ingredientName: 'Nope',
      requiredQuantity: 100,
      requiredUnit: 'g',
      lots: [],
    });
    expect(plan.status).toBe('unmatched');
    expect(plan.uncoveredQuantity).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// State machine (§24)
// ---------------------------------------------------------------------------

describe('deduction plan state machine', () => {
  it('enough stock across two lots -> ready', () => {
    const plan = propose([datedLot('a', 200, '2026-06-11'), datedLot('b', 200, '2026-06-25')], 300);
    expect(plan.status).toBe('ready');
    expect(plan.allocations).toHaveLength(2);
  });

  it('insufficient across multiple lots -> needs_decision, nothing auto-submittable', () => {
    const plan = propose([datedLot('a', 50, '2026-06-11'), datedLot('b', 50, '2026-06-25')], 300);
    expect(plan.status).toBe('needs_decision');
  });

  it('applyPartialConfirmation: needs_decision -> partial, deduct exactly what the lots cover', () => {
    const plan = propose([datedLot('a', 120, '2026-06-11')], 500);
    const confirmed = applyPartialConfirmation(plan);
    expect(confirmed.status).toBe('partial');
    expect(confirmed.allocations[0].proposedDeduction).toBe(120);
    expect(confirmed.uncoveredQuantity).toBe(380); // acknowledged as sourced elsewhere, never deducted
  });

  it('applyPartialConfirmation is a no-op from any status other than needs_decision', () => {
    const ready = propose([datedLot('a', 500, '2026-06-25')], 100);
    expect(applyPartialConfirmation(ready)).toBe(ready);
    const unmatched = proposeIngredientDeduction({
      recipeIngredientId: 'r',
      ingredientId: 'ing-none',
      ingredientName: 'None',
      requiredQuantity: 100,
      requiredUnit: 'g',
      lots: [],
    });
    expect(applyPartialConfirmation(unmatched)).toBe(unmatched);
  });

  it('applySkip clears allocations and deducts nothing regardless of prior status', () => {
    const plan = propose([datedLot('a', 120, '2026-06-11')], 500);
    const skipped = applySkip(plan);
    expect(skipped).toMatchObject({ status: 'skipped', allocations: [], coveredQuantity: 0, uncoveredQuantity: 0 });
  });

  it('serving change recomputes the FEFO allocation against current stock', () => {
    const lots = [datedLot('a', 200, '2026-06-11'), datedLot('b', 500, '2026-06-25')];
    const plan = propose(lots, 150);
    expect(plan.allocations).toHaveLength(1);
    const rescaled = rescaleForServings(plan, 400, lots);
    expect(rescaled.status).toBe('ready');
    expect(rescaled.allocations.map((a) => a.proposedDeduction)).toEqual([200, 200]);
  });

  it('serving change invalidates a stale partial confirmation - it does not stay "partial"', () => {
    const lots = [datedLot('a', 120, '2026-06-11')];
    const partial = applyPartialConfirmation(propose(lots, 500));
    expect(partial.status).toBe('partial');
    const rescaled = rescaleForServings(partial, 600, lots);
    expect(rescaled.status).toBe('needs_decision');
    expect(rescaled.uncoveredQuantity).toBe(480);
  });

  it('serving change: a partial that now fits resolves straight to ready, not a stale partial', () => {
    const lots = [datedLot('a', 120, '2026-06-11')];
    const partial = applyPartialConfirmation(propose(lots, 500));
    const rescaled = rescaleForServings(partial, 100, lots);
    expect(rescaled.status).toBe('ready');
  });

  it('a deliberate skip survives a serving change (quantity-independent)', () => {
    const lots = [datedLot('a', 120, '2026-06-11')];
    const skipped = applySkip(propose(lots, 500));
    const rescaled = rescaleForServings(skipped, 50, lots);
    expect(rescaled.status).toBe('skipped');
    expect(rescaled.requiredQuantity).toBe(50);
  });

  it('a manual lot choice is not silently overwritten by FEFO on a serving change', () => {
    const lots = [
      datedLot('urgent', 400, '2026-06-11'),
      datedLot('frozen', 900, '2026-07-15'),
    ];
    // User overrides the FEFO "urgent" pick, choosing the frozen lot instead.
    const manual = proposeIngredientDeduction({
      recipeIngredientId: 'ri-1',
      ingredientId: CHICKEN,
      ingredientName: 'Chicken Breast',
      requiredQuantity: 300,
      requiredUnit: 'g',
      lots,
      restrictToLotIds: ['frozen'],
      manualOverride: true,
    });
    expect(manual.allocations.map((a) => a.pantryItemId)).toEqual(['frozen']);

    const rescaled = rescaleForServings(manual, 500, lots);
    expect(rescaled.manualOverride).toBe(true);
    expect(rescaled.allocations.map((a) => a.pantryItemId)).toEqual(['frozen']); // still the user's lot, NOT 'urgent'
    expect(rescaled.status).toBe('ready');
  });

  it('a manual choice that no longer covers the scaled requirement drops to needs_decision', () => {
    const lots = [datedLot('small', 350, '2026-06-11'), datedLot('big', 900, '2026-07-15')];
    const manual = proposeIngredientDeduction({
      recipeIngredientId: 'ri-1',
      ingredientId: CHICKEN,
      ingredientName: 'Chicken Breast',
      requiredQuantity: 300,
      requiredUnit: 'g',
      lots,
      restrictToLotIds: ['small'],
      manualOverride: true,
    });
    expect(manual.status).toBe('ready');
    const rescaled = rescaleForServings(manual, 600, lots);
    expect(rescaled.status).toBe('needs_decision');
    expect(rescaled.uncoveredQuantity).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// index builder / matching
// ---------------------------------------------------------------------------

describe('buildCookingPantryIndex / cookingLotsForIngredient', () => {
  it('matches by canonical id, then falls back to an exact normalized name only for non-catalog ids', () => {
    const items = [
      pantryItem({ id: 'byId', ingredientId: CHICKEN, name: 'Chicken Breast', quantity: 100 }),
      pantryItem({ id: 'byName', ingredientId: 'pantry-local-xyz', name: 'Leftover Rice', quantity: 100 }),
    ];
    const index = buildCookingPantryIndex(items, TZ, NOW);
    // Real catalog id -> id match only (no fuzzy fallback).
    expect(cookingLotsForIngredient({ ingredientId: CHICKEN, name: 'Chicken Breast' }, index).map((l) => l.pantryItemId)).toEqual(['byId']);
    // Unknown id -> exact normalized-name fallback.
    expect(
      cookingLotsForIngredient({ ingredientId: 'recipe-ing-row-id', name: 'leftover rice' }, index).map((l) => l.pantryItemId),
    ).toEqual(['byName']);
    // Unknown id whose name matches nothing -> no lots.
    expect(cookingLotsForIngredient({ ingredientId: 'recipe-ing-row-id', name: 'saffron' }, index)).toEqual([]);
  });

  it('carries the freshness assessment onto each lot', () => {
    const index = buildCookingPantryIndex(
      [pantryItem({ id: 'L1', quantity: 100, estimatedExpirationDate: '2026-06-11', expirationConfidence: 'high' })],
      TZ,
      NOW,
    );
    const [l] = cookingLotsForIngredient({ ingredientId: CHICKEN, name: 'Chicken Breast' }, index);
    expect(l.expiry.state).toBe('critical');
    expect(l.expiry.phrase).toBe('Expires tomorrow');
  });
});

function manual(lots: CookingPantryLot[], requiredQuantity: number, restrictToLotIds: string[], requiredUnit = 'g', conversionMeta?: IngredientConversionMeta) {
  return proposeIngredientDeduction({
    recipeIngredientId: 'ri-1',
    ingredientId: CHICKEN,
    ingredientName: 'Chicken Breast',
    requiredQuantity,
    requiredUnit,
    lots,
    conversionMeta,
    restrictToLotIds,
    manualOverride: true,
  });
}

function pickerRows(lots: CookingPantryLot[], selectedLotIds: string[] = [], requiredUnit = 'g', conversionMeta?: IngredientConversionMeta) {
  return describeSelectableLots({ requiredUnit, lots, conversionMeta, selectedLotIds });
}

// ---------------------------------------------------------------------------
// Manual picker domain (§19)
// ---------------------------------------------------------------------------

describe('describeSelectableLots - the manual picker rows', () => {
  it('lists every matching lot FEFO-ordered, regardless of input array order', () => {
    const lots = [
      datedLot('fresh', 500, '2026-07-01'),
      lot({ pantryItemId: 'nodate', quantity: 200 }),
      datedLot('critical', 200, '2026-06-11'),
    ];
    const a = pickerRows(lots).map((r) => r.pantryItemId);
    const b = pickerRows([...lots].reverse()).map((r) => r.pantryItemId);
    expect(a).toEqual(['critical', 'fresh', 'nodate']);
    expect(b).toEqual(['critical', 'fresh', 'nodate']);
  });

  it('marks selected rows from the passed-in id set', () => {
    const rows = pickerRows([datedLot('a', 200, '2026-06-11'), datedLot('b', 200, '2026-06-25')], ['b']);
    expect(rows.find((r) => r.pantryItemId === 'a')?.selected).toBe(false);
    expect(rows.find((r) => r.pantryItemId === 'b')?.selected).toBe(true);
  });

  it('exact-unit lots are selectable with no conversion preview', () => {
    const [row] = pickerRows([datedLot('g', 300, '2026-06-25')], [], 'g');
    expect(row).toMatchObject({ selectable: true, convertible: true, approxInRequiredUnit: undefined });
  });

  it('g/kg lots are selectable and show an approx preview in the recipe unit', () => {
    const [row] = pickerRows([datedLot('kg', 0.5, '2026-06-25', 'high', { unit: 'kg' })], [], 'g');
    expect(row.selectable).toBe(true);
    expect(row.approxInRequiredUnit).toBeCloseTo(500, 3);
  });

  it('oz/lb lots are selectable', () => {
    const [row] = pickerRows([datedLot('oz', 8, '2026-06-25', 'high', { unit: 'oz' })], [], 'g');
    expect(row.selectable).toBe(true);
    expect(row.approxInRequiredUnit).toBeCloseTo(226.796, 2);
  });

  it('density-backed volume lots are selectable when metadata exists', () => {
    const [row] = pickerRows([datedLot('ml', 500, '2026-06-25', 'high', { unit: 'ml' })], [], 'g', { densityGPerMl: 1 });
    expect(row.selectable).toBe(true);
    expect(row.approxInRequiredUnit).toBeCloseTo(500, 3);
  });

  it('count lots are selectable when per-unit weight metadata exists', () => {
    const [row] = pickerRows([datedLot('items', 3, '2026-06-25', 'high', { unit: 'item' })], [], 'g', { gramsPerUnit: { item: 150 } });
    expect(row.selectable).toBe(true);
    expect(row.approxInRequiredUnit).toBeCloseTo(450, 3);
  });

  it('an unresolvable lot is shown honestly but NOT selectable', () => {
    const [row] = pickerRows([datedLot('bag', 1, '2026-06-11', 'high', { unit: 'bag' })], [], 'g');
    expect(row).toMatchObject({ selectable: false, convertible: false, unresolvedReason: 'unit_mismatch' });
    expect(row.freshnessPhrase).toBe('Expires tomorrow'); // freshness still shown
  });

  it('carries the centralized freshness phrase verbatim', () => {
    const rows = pickerRows([
      datedLot('c', 100, '2026-06-11', 'medium'),
      datedLot('p', 100, '2026-06-08'),
      lot({ pantryItemId: 'u', quantity: 100 }),
    ]);
    expect(rows.map((r) => r.freshnessPhrase)).toEqual([
      'Past its date — check before using',
      'Estimated to expire tomorrow',
      'No tracked date',
    ]);
  });
});

describe('FEFO within a manually selected set', () => {
  it('allocates in FEFO order across ONLY the selected lots', () => {
    const lots = [
      datedLot('critical', 150, '2026-06-11'),
      datedLot('soon', 150, '2026-06-13'),
      datedLot('fresh', 999, '2026-07-01'),
    ];
    // User allows only soon + fresh (NOT the critical lot).
    const plan = manual(lots, 200, ['fresh', 'soon']);
    expect(plan.status).toBe('ready');
    expect(plan.allocations.map((a) => a.pantryItemId)).toEqual(['soon', 'fresh']); // FEFO inside the chosen set
    expect(plan.allocations[0].proposedDeduction).toBe(150);
    expect(plan.allocations[1].proposedDeduction).toBe(50);
  });

  it('result is independent of the restrictToLotIds order', () => {
    const lots = [datedLot('a', 100, '2026-06-13'), datedLot('b', 100, '2026-06-11')];
    const x = manual(lots, 150, ['a', 'b']).allocations.map((a) => a.pantryItemId);
    const y = manual(lots, 150, ['b', 'a']).allocations.map((a) => a.pantryItemId);
    expect(x).toEqual(['b', 'a']);
    expect(y).toEqual(['b', 'a']);
  });

  it('selecting a single lot works (one-lot manual override)', () => {
    const lots = [datedLot('urgent', 400, '2026-06-11'), datedLot('frozen', 900, '2026-07-15')];
    const plan = manual(lots, 300, ['frozen']);
    expect(plan.allocations.map((a) => a.pantryItemId)).toEqual(['frozen']);
    expect(plan.manualLotIds).toEqual(['frozen']);
  });

  it('a selected set that is convertible-unit still allocates (g requirement, kg + g lots)', () => {
    const lots = [
      datedLot('kg', 0.2, '2026-06-11', 'high', { unit: 'kg' }),
      datedLot('g', 500, '2026-06-25', 'high', { unit: 'g' }),
    ];
    const plan = manual(lots, 300, ['kg', 'g'], 'g');
    expect(plan.status).toBe('ready');
    expect(plan.allocations[0]).toMatchObject({ pantryItemId: 'kg', unit: 'kg' });
    expect(plan.allocations[0].proposedDeduction).toBeCloseTo(0.2, 5); // lot decremented in ITS unit
    expect(plan.allocations[0].coveredAmount).toBeCloseTo(200, 3); // shown in the recipe unit
    expect(plan.allocations[1].pantryItemId).toBe('g');
  });
});

// ---------------------------------------------------------------------------
// User intent (§20)
// ---------------------------------------------------------------------------

describe('manual selection preserves user intent', () => {
  const lots = () => [
    datedLot('urgent', 400, '2026-06-11'),
    datedLot('frozen', 900, '2026-07-15'),
  ];

  it('stores the selected ids as durable manual intent (not derived from allocations)', () => {
    const plan = manual(lots(), 300, ['frozen']);
    expect(plan.manualOverride).toBe(true);
    expect(plan.manualLotIds).toEqual(['frozen']);
  });

  it('a serving INCREASE recomputes within the same selected set', () => {
    const plan = manual(lots(), 300, ['frozen']);
    const bigger = rescaleForServings(plan, 800, lots());
    expect(bigger.allocations.map((a) => a.pantryItemId)).toEqual(['frozen']);
    expect(bigger.status).toBe('ready');
    expect(bigger.allocations[0].proposedDeduction).toBe(800);
  });

  it('a serving DECREASE recomputes within the same selected set', () => {
    const plan = manual(lots(), 300, ['frozen']);
    const smaller = rescaleForServings(plan, 100, lots());
    expect(smaller.allocations.map((a) => a.pantryItemId)).toEqual(['frozen']);
    expect(smaller.allocations[0].proposedDeduction).toBe(100);
  });

  it('global FEFO never silently replaces the manual choice on a serving change', () => {
    const plan = manual(lots(), 300, ['frozen']); // deliberately NOT the urgent lot
    const rescaled = rescaleForServings(plan, 500, lots());
    expect(rescaled.allocations.some((a) => a.pantryItemId === 'urgent')).toBe(false);
  });

  it('resetting (no restrict, manualOverride false) restores the global FEFO pick', () => {
    const reset = proposeIngredientDeduction({
      recipeIngredientId: 'ri-1',
      ingredientId: CHICKEN,
      ingredientName: 'Chicken Breast',
      requiredQuantity: 300,
      requiredUnit: 'g',
      lots: lots(),
      manualOverride: false,
    });
    expect(reset.manualOverride).toBe(false);
    expect(reset.manualLotIds).toBeUndefined();
    expect(reset.allocations[0].pantryItemId).toBe('urgent'); // FEFO again
  });

  it('a selected lot that has disappeared forces needs_decision (no silent substitution)', () => {
    const plan = manual(lots(), 300, ['frozen', 'urgent']);
    expect(plan.status).toBe('ready');
    // "frozen" is gone from the pantry on the next recompute.
    const rescaled = rescaleForServings(plan, 300, [datedLot('urgent', 400, '2026-06-11')]);
    expect(rescaled.status).toBe('needs_decision');
    expect(rescaled.missingSelectedLotIds).toEqual(['frozen']);
    expect(rescaled.unresolvedReason).toBe('lot_unavailable');
  });

  it('a selected subset that is insufficient -> needs_decision', () => {
    const plan = manual([datedLot('a', 120, '2026-06-11'), datedLot('b', 900, '2026-07-15')], 500, ['a']);
    expect(plan.status).toBe('needs_decision');
    expect(plan.uncoveredQuantity).toBe(380);
  });

  it('a selected subset that becomes sufficient after a serving decrease -> ready', () => {
    const set = [datedLot('a', 120, '2026-06-11'), datedLot('b', 900, '2026-07-15')];
    const plan = manual(set, 500, ['a']);
    expect(plan.status).toBe('needs_decision');
    const smaller = rescaleForServings(plan, 100, set);
    expect(smaller.status).toBe('ready');
    expect(smaller.allocations[0].pantryItemId).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// Post-cook urgency summary (§21)
// ---------------------------------------------------------------------------

describe('summarizeUrgentDeductions', () => {
  it('counts an actually-deducted critical lot', () => {
    expect(
      summarizeUrgentDeductions([
        { ingredientName: 'Chicken', expiryState: 'critical', freshnessPhrase: 'Expires tomorrow', deductedQuantity: 200 },
      ]),
    ).toBe('Used Chicken · Expires tomorrow.');
  });

  it('counts a use_soon lot', () => {
    expect(
      summarizeUrgentDeductions([
        { ingredientName: 'Spinach', expiryState: 'use_soon', freshnessPhrase: 'Best used within 3 days', deductedQuantity: 80 },
      ]),
    ).toBe('Used Spinach · Best used within 3 days.');
  });

  it('does NOT count fresh or unknown lots', () => {
    expect(
      summarizeUrgentDeductions([
        { ingredientName: 'Rice', expiryState: 'fresh', freshnessPhrase: 'Fresh', deductedQuantity: 100 },
        { ingredientName: 'Oil', expiryState: 'unknown', freshnessPhrase: 'No tracked date', deductedQuantity: 15 },
      ]),
    ).toBeNull();
  });

  it('keeps estimated wording estimated', () => {
    expect(
      summarizeUrgentDeductions([
        { ingredientName: 'Chicken', expiryState: 'critical', freshnessPhrase: 'Estimated to expire tomorrow', deductedQuantity: 200 },
      ]),
    ).toBe('Used Chicken · Estimated to expire tomorrow.');
  });

  it('ignores a lot with zero deducted quantity', () => {
    expect(
      summarizeUrgentDeductions([
        { ingredientName: 'Chicken', expiryState: 'critical', freshnessPhrase: 'Expires tomorrow', deductedQuantity: 0 },
      ]),
    ).toBeNull();
  });

  it('a multi-lot cook counts only the actually-deducted urgent lots', () => {
    const line = summarizeUrgentDeductions([
      { ingredientName: 'Chicken', expiryState: 'critical', freshnessPhrase: 'Expires tomorrow', deductedQuantity: 200 },
      { ingredientName: 'Chicken', expiryState: 'use_soon', freshnessPhrase: 'Best used within 5 days', deductedQuantity: 100 },
      { ingredientName: 'Chicken', expiryState: 'fresh', freshnessPhrase: 'Fresh', deductedQuantity: 300 },
    ]);
    expect(line).toBe('You used 2 pantry items that were due soon.');
  });

  it('never uses "waste avoided" / "food saved" phrasing', () => {
    const line = summarizeUrgentDeductions([
      { ingredientName: 'Chicken', expiryState: 'critical', freshnessPhrase: 'Expires tomorrow', deductedQuantity: 200 },
    ]);
    expect(line).not.toMatch(/waste|saved|prevent/i);
  });

  it('reflects a user override: SmartPrep proposed the urgent lot, user cooked the fresh one', () => {
    // The summary is built from what was ACTUALLY deducted, so a fresh-only cook has no urgency line.
    const confirmedFreshOnly = [
      { ingredientName: 'Chicken', expiryState: 'fresh' as const, freshnessPhrase: 'Fresh', deductedQuantity: 300 },
    ];
    expect(summarizeUrgentDeductions(confirmedFreshOnly)).toBeNull();
  });
});

function pantryItem(over: Partial<PantryItem> = {}): PantryItem {
  return {
    id: over.id ?? 'p1',
    ingredientId: over.ingredientId ?? CHICKEN,
    name: over.name ?? 'Chicken Breast',
    imageUri: '',
    category: 'protein',
    quantity: over.quantity ?? 100,
    unit: over.unit ?? 'g',
    freshness: { score: 50, confidence: 0.9, label: 'use_soon' },
    addedAt: 't',
    updatedAt: 't',
    source: 'manual',
    status: over.status ?? 'active',
    estimatedExpirationDate: over.estimatedExpirationDate,
    expirationConfidence: over.expirationConfidence,
    ...over,
  };
}
