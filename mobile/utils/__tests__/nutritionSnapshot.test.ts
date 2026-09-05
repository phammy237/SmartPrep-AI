import { NutritionSnapshot } from '@/types';
import {
  autoResolvePantryMatch,
  checkMacroCalorieConsistency,
  confirmPartialDeduction,
  dailyNutritionTotal,
  findCompatiblePantryCandidates,
  isAllowedCookingTransition,
  isAllowedPlanTransition,
  localWeekRange,
  PantryMatchCandidate,
  rescalePantryMatch,
  scaleNutritionSnapshot,
  scaleRequestedQuantity,
  selectEffectiveGoal,
  skipPantryDeduction,
  sumNutritionSnapshots,
  validateDeduction,
  validatePreparedMealConsumption,
  weeklyNutritionTotal,
} from '../nutritionSnapshot';

function snapshot(overrides: Partial<NutritionSnapshot> = {}): NutritionSnapshot {
  return {
    calories: 400,
    proteinG: 20,
    carbsG: 40,
    fatG: 15,
    fiberG: 5,
    sugarG: null,
    sodiumMg: null,
    status: 'estimated',
    calculationBasis: 'per_serving',
    ...overrides,
  };
}

describe('scaleNutritionSnapshot', () => {
  it('scales every known nutrient by the factor', () => {
    const result = scaleNutritionSnapshot(snapshot(), 2);
    expect(result.calories).toBe(800);
    expect(result.proteinG).toBe(40);
    expect(result.carbsG).toBe(80);
    expect(result.fatG).toBe(30);
    expect(result.fiberG).toBe(10);
  });

  it('preserves unknown (null) nutrients instead of scaling them to zero', () => {
    const result = scaleNutritionSnapshot(snapshot({ sugarG: null, sodiumMg: null }), 3);
    expect(result.sugarG).toBeNull();
    expect(result.sodiumMg).toBeNull();
  });

  it('scaling to a fraction (e.g. 0.5 servings consumed) is deterministic', () => {
    const result = scaleNutritionSnapshot(snapshot({ calories: 620 }), 0.5);
    expect(result.calories).toBe(310);
  });
});

describe('sumNutritionSnapshots', () => {
  it('sums known values across snapshots', () => {
    const total = sumNutritionSnapshots([snapshot({ calories: 100 }), snapshot({ calories: 200 })]);
    expect(total.calories).toBe(300);
    expect(total.contributingCount).toBe(2);
  });

  it('summing zero snapshots yields an all-zero, verified total (not "unknown")', () => {
    const total = sumNutritionSnapshots([]);
    expect(total.calories).toBe(0);
    expect(total.proteinG).toBe(0);
    expect(total.status).toBe('verified');
    expect(total.incompleteFields).toEqual([]);
  });

  it('a field unknown in every contributing snapshot stays null in the total', () => {
    const total = sumNutritionSnapshots([snapshot({ sodiumMg: null }), snapshot({ sodiumMg: null })]);
    expect(total.sodiumMg).toBeNull();
    expect(total.incompleteFields).not.toContain('sodiumMg');
  });

  it('a field known in only some snapshots is summed from the known ones and flagged incomplete', () => {
    const total = sumNutritionSnapshots([snapshot({ sugarG: 10 }), snapshot({ sugarG: null })]);
    expect(total.sugarG).toBe(10);
    expect(total.incompleteFields).toContain('sugarG');
    expect(total.status).toBe('incomplete');
  });

  it('a calories-only quick-add contributes calories without fabricating protein/carbs/fat as zero', () => {
    const quickAdd = snapshot({
      calories: 250,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      status: 'incomplete',
    });
    const total = sumNutritionSnapshots([quickAdd]);
    expect(total.calories).toBe(250);
    expect(total.proteinG).toBeNull();
    expect(total.carbsG).toBeNull();
    expect(total.fatG).toBeNull();
    expect(total.status).toBe('incomplete');
  });

  it('status is the worst across contributors (incomplete > estimated > verified)', () => {
    const total = sumNutritionSnapshots([snapshot({ status: 'verified' }), snapshot({ status: 'estimated' })]);
    expect(total.status).toBe('estimated');
  });
});

describe('checkMacroCalorieConsistency', () => {
  it('is not_applicable when any of calories/protein/carbs/fat is unknown', () => {
    expect(checkMacroCalorieConsistency(snapshot({ carbsG: null })).status).toBe('not_applicable');
  });

  it('is ok when calories roughly match 4P + 4C + 9F', () => {
    // 20*4 + 40*4 + 15*9 = 80 + 160 + 135 = 375; calories=400 is well within tolerance
    const result = checkMacroCalorieConsistency(snapshot({ calories: 400, proteinG: 20, carbsG: 40, fatG: 15 }));
    expect(result.status).toBe('ok');
  });

  it('warns (does not reject) on a large mismatch, without throwing', () => {
    const result = checkMacroCalorieConsistency(snapshot({ calories: 2000, proteinG: 20, carbsG: 40, fatG: 15 }));
    expect(result.status).toBe('warning');
  });

  it('does not warn on small rounding differences from fiber/sugar alcohols', () => {
    // Slightly under the pure-macro calculation, well within the generous tolerance.
    const result = checkMacroCalorieConsistency(snapshot({ calories: 360, proteinG: 20, carbsG: 40, fatG: 15 }));
    expect(result.status).toBe('ok');
  });
});

describe('dailyNutritionTotal / weeklyNutritionTotal', () => {
  const logs = [
    { localDate: '2026-08-10', nutritionSnapshot: snapshot({ calories: 100 }) },
    { localDate: '2026-08-10', nutritionSnapshot: snapshot({ calories: 50 }) },
    { localDate: '2026-08-11', nutritionSnapshot: snapshot({ calories: 300 }) },
    { localDate: '2026-08-10', nutritionSnapshot: snapshot({ calories: 999 }), voidedAt: '2026-08-10T12:00:00Z' },
  ];

  it('includes only logs within the exact local day', () => {
    const total = dailyNutritionTotal(logs, '2026-08-10');
    expect(total.calories).toBe(150);
  });

  it('excludes voided logs from daily totals', () => {
    const total = dailyNutritionTotal(logs, '2026-08-10');
    expect(total.contributingCount).toBe(2);
  });

  it('includes only logs within the inclusive week range', () => {
    const total = weeklyNutritionTotal(logs, '2026-08-10', '2026-08-16');
    expect(total.calories).toBe(450);
  });
});

describe('daily totals after a meal-log correction', () => {
  it('counts only the replacement, never both replacement and voided original (correct_meal_log scenario)', () => {
    // Simulates: original log had calories=999 (wrong), user corrected it via
    // correct_meal_log, which voids the original and inserts a replacement
    // with calories=450. Both rows exist in history; only the non-voided
    // replacement should count toward the day's total.
    const logs = [
      { localDate: '2026-08-13', nutritionSnapshot: snapshot({ calories: 999 }), voidedAt: '2026-08-13T20:00:00Z' },
      { localDate: '2026-08-13', nutritionSnapshot: snapshot({ calories: 450 }) },
    ];
    const total = dailyNutritionTotal(logs, '2026-08-13');
    expect(total.calories).toBe(450);
    expect(total.contributingCount).toBe(1);
  });
});

describe('localWeekRange', () => {
  it('resolves the Monday-Sunday week containing the local date, honoring timezone', () => {
    // 2026-08-13 is a Thursday.
    const { weekStart, weekEnd } = localWeekRange(new Date('2026-08-13T12:00:00Z'), 'UTC');
    expect(weekStart).toBe('2026-08-10');
    expect(weekEnd).toBe('2026-08-16');
  });

  it('a timezone shift that changes the local calendar day can change the resolved week', () => {
    // 2026-08-10T02:00:00Z is Sunday Aug 9 in America/New_York (UTC-4 in August).
    const { weekStart, weekEnd } = localWeekRange(new Date('2026-08-10T02:00:00Z'), 'America/New_York');
    expect(weekStart).toBe('2026-08-03');
    expect(weekEnd).toBe('2026-08-09');
  });
});

describe('selectEffectiveGoal', () => {
  const goals = [
    { value: 'old', effectiveStart: '2026-01-01T00:00:00Z', effectiveEnd: '2026-06-01T00:00:00Z' },
    { value: 'current', effectiveStart: '2026-06-01T00:00:00Z', effectiveEnd: null },
  ];

  it('selects the goal whose range contains the given date', () => {
    expect(selectEffectiveGoal(goals, new Date('2026-03-01T00:00:00Z'))).toBe('old');
    expect(selectEffectiveGoal(goals, new Date('2026-08-01T00:00:00Z'))).toBe('current');
  });

  it('returns null when no goal was effective at that date', () => {
    expect(selectEffectiveGoal(goals, new Date('2025-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('validatePreparedMealConsumption', () => {
  it('reduces remaining servings for a valid amount', () => {
    const result = validatePreparedMealConsumption(4, 1.5);
    expect(result).toEqual({ ok: true, newRemaining: 2.5 });
  });

  it('rejects consumption exceeding remaining servings', () => {
    const result = validatePreparedMealConsumption(2, 3);
    expect(result.ok).toBe(false);
  });

  it('rejects a zero or negative amount', () => {
    expect(validatePreparedMealConsumption(2, 0).ok).toBe(false);
    expect(validatePreparedMealConsumption(2, -1).ok).toBe(false);
  });
});

describe('plan/cooking transitions', () => {
  it('allows planned -> completed/skipped/cancelled', () => {
    expect(isAllowedPlanTransition('planned', 'completed')).toBe(true);
    expect(isAllowedPlanTransition('planned', 'skipped')).toBe(true);
    expect(isAllowedPlanTransition('planned', 'cancelled')).toBe(true);
  });

  it('does not allow leaving a completed plan item', () => {
    expect(isAllowedPlanTransition('completed', 'planned')).toBe(false);
  });

  it('allows started -> completed/cancelled, nothing else', () => {
    expect(isAllowedCookingTransition('started', 'completed')).toBe(true);
    expect(isAllowedCookingTransition('started', 'cancelled')).toBe(true);
    expect(isAllowedCookingTransition('completed', 'cancelled')).toBe(false);
    expect(isAllowedCookingTransition('cancelled', 'completed')).toBe(false);
  });

  it('does not treat re-completing a completed cooking event as a no-op success', () => {
    expect(isAllowedCookingTransition('completed', 'completed')).toBe(false);
  });
});

describe('validateDeduction', () => {
  it('is valid when skipped or explicitly not sourced from the pantry', () => {
    expect(
      validateDeduction({ wasSkipped: true, notSourcedFromPantry: false, deductedQuantity: 0, userConfirmed: false }).ok,
    ).toBe(true);
    expect(
      validateDeduction({ wasSkipped: false, notSourcedFromPantry: true, deductedQuantity: 0, userConfirmed: false }).ok,
    ).toBe(true);
  });

  it('requires user confirmation for a real deduction', () => {
    const result = validateDeduction({
      wasSkipped: false,
      notSourcedFromPantry: false,
      pantryItemId: 'p1',
      pantryUnit: 'g',
      deductedUnit: 'g',
      deductedQuantity: 100,
      availableQuantity: 500,
      userConfirmed: false,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects incompatible units instead of silently converting', () => {
    const result = validateDeduction({
      wasSkipped: false,
      notSourcedFromPantry: false,
      pantryItemId: 'p1',
      pantryUnit: 'g',
      deductedUnit: 'oz',
      deductedQuantity: 3,
      availableQuantity: 500,
      userConfirmed: true,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a deduction exceeding available pantry stock', () => {
    const result = validateDeduction({
      wasSkipped: false,
      notSourcedFromPantry: false,
      pantryItemId: 'p1',
      pantryUnit: 'g',
      deductedUnit: 'g',
      deductedQuantity: 600,
      availableQuantity: 500,
      userConfirmed: true,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts an exact-unit, confirmed, in-stock deduction', () => {
    const result = validateDeduction({
      wasSkipped: false,
      notSourcedFromPantry: false,
      pantryItemId: 'p1',
      pantryUnit: 'g',
      deductedUnit: 'g',
      deductedQuantity: 200,
      availableQuantity: 500,
      userConfirmed: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe('scaleRequestedQuantity', () => {
  it('scales a base-servings quantity to the actual servings prepared', () => {
    expect(scaleRequestedQuantity(200, 2, 4)).toBe(400);
    expect(scaleRequestedQuantity(200, 2, 1)).toBe(100);
  });

  it('falls back to an unscaled amount when the recipe has no servings basis', () => {
    expect(scaleRequestedQuantity(200, 0, 4)).toBe(200);
  });
});

function candidate(overrides: Partial<PantryMatchCandidate> = {}): PantryMatchCandidate {
  return { id: 'pantry-1', ingredientId: 'ing-pasta', quantity: 500, unit: 'g', status: 'active', ...overrides };
}

describe('autoResolvePantryMatch', () => {
  it('matches automatically to "full" when the candidate ingredientId matches and stock is sufficient (confidence "exact")', () => {
    const result = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate());
    expect(result).toMatchObject({
      pantryItemId: 'pantry-1',
      unitsCompatible: true,
      resolution: 'full',
      deductedQuantity: 200,
      uncoveredQuantity: 0,
      shortfall: 0,
      matchConfidence: 'exact',
    });
  });

  it('a match to a different ingredientId is confidence "likely", not "exact", but still auto-resolves to "full" when sufficient', () => {
    const result = autoResolvePantryMatch(200, 'g', 'ing-flour', candidate({ ingredientId: 'ing-pasta' }));
    expect(result.matchConfidence).toBe('likely');
    expect(result.resolution).toBe('full');
  });

  it('never silently selects an incompatible unit - resolves to "incompatible" with no deduction, not a fabricated conversion', () => {
    const result = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate({ unit: 'oz' }));
    expect(result.unitsCompatible).toBe(false);
    expect(result.resolution).toBe('incompatible');
    expect(result.deductedQuantity).toBe(0);
    // The mismatch is still recorded (pantryItemId/pantryUnit present) so the UI can explain why.
    expect(result.pantryItemId).toBe('pantry-1');
  });

  it('a depleted (zero-quantity) candidate is never selectable - resolves the same as no candidate ("unmatched")', () => {
    const result = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate({ quantity: 0, status: 'depleted' }));
    expect(result.resolution).toBe('unmatched');
    expect(result.pantryItemId).toBeUndefined();
  });

  it('an inactive candidate (status "depleted" but nonzero stale quantity) is never selectable', () => {
    const result = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate({ status: 'depleted', quantity: 50 }));
    expect(result.resolution).toBe('unmatched');
  });

  it('insufficient stock does NOT silently clamp and proceed - it stops at "needs_decision" with the exact shortfall, deducting nothing yet', () => {
    const result = autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    expect(result.resolution).toBe('needs_decision');
    expect(result.deductedQuantity).toBe(0);
    expect(result.uncoveredQuantity).toBe(0); // not yet confirmed, so not yet "uncovered"
    expect(result.requiredQuantity).toBe(500); // required quantity is preserved, untouched
    expect(result.availableQuantity).toBe(120); // available quantity is preserved, untouched
    expect(result.shortfall).toBe(380); // exact shortfall shown to the user
  });

  it('no candidate at all (explicit skip / not sourced from pantry) resolves to "unmatched", deducting nothing', () => {
    const result = autoResolvePantryMatch(200, 'g', 'ing-pasta', null);
    expect(result).toMatchObject({ pantryItemId: undefined, unitsCompatible: false, resolution: 'unmatched', deductedQuantity: 0, uncoveredQuantity: 0, matchConfidence: 'none' });
  });
});

describe('confirmPartialDeduction', () => {
  it('explicit partial deduction: deducts exactly what is available and records the exact uncovered remainder', () => {
    const needsDecision = autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    const confirmed = confirmPartialDeduction(needsDecision);
    expect(confirmed.resolution).toBe('partial');
    expect(confirmed.deductedQuantity).toBe(120); // exactly what's available - never more
    expect(confirmed.uncoveredQuantity).toBe(380); // required (500) - deducted (120)
    expect(confirmed.requiredQuantity).toBe(500); // required quantity is still preserved separately
  });

  it('never represents a partial deduction as full coverage', () => {
    const confirmed = confirmPartialDeduction(autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 })));
    expect(confirmed.deductedQuantity).not.toBe(confirmed.requiredQuantity);
    expect(confirmed.resolution).not.toBe('full');
  });

  it('is a no-op unless the row is actually in "needs_decision" (cannot fabricate a partial confirmation out of nothing)', () => {
    const sufficient = autoResolvePantryMatch(100, 'g', 'ing-pasta', candidate({ quantity: 500 }));
    expect(confirmPartialDeduction(sufficient)).toEqual(sufficient);
    const unmatched = autoResolvePantryMatch(100, 'g', 'ing-pasta', null);
    expect(confirmPartialDeduction(unmatched)).toEqual(unmatched);
  });
});

describe('skipPantryDeduction', () => {
  it('skip behavior: deducts nothing regardless of prior state', () => {
    const needsDecision = autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    const skipped = skipPantryDeduction(needsDecision);
    expect(skipped).toMatchObject({ resolution: 'skipped', deductedQuantity: 0, uncoveredQuantity: 0 });
  });
});

describe('rescalePantryMatch (servings-prepared changes)', () => {
  it('recalculates the required quantity while preserving an intentional manual remap (same candidate id)', () => {
    const original = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate({ id: 'manually-remapped', ingredientId: 'ing-flour', quantity: 500 }));
    const rescaled = rescalePantryMatch(original, 400, 'g', 'ing-pasta', candidate({ id: 'manually-remapped', ingredientId: 'ing-flour', quantity: 500 }));
    expect(rescaled.pantryItemId).toBe('manually-remapped'); // remap preserved, not reverted to auto-match
    expect(rescaled.requiredQuantity).toBe(400);
    expect(rescaled.resolution).toBe('full');
  });

  it('a previous partial confirmation is invalidated and must be reconfirmed if the required quantity changes and is still short', () => {
    const needsDecision = autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    const partiallyConfirmed = confirmPartialDeduction(needsDecision);
    expect(partiallyConfirmed.resolution).toBe('partial');

    // Servings prepared changed - required quantity is now even higher, still insufficient.
    const rescaled = rescalePantryMatch(partiallyConfirmed, 600, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    expect(rescaled.resolution).toBe('needs_decision'); // NOT still "partial" - must be explicitly reconfirmed
    expect(rescaled.deductedQuantity).toBe(0);
    expect(rescaled.shortfall).toBe(480);
  });

  it('a previous partial confirmation resolves straight to "full" (not a stale "partial") if the new required amount now fits', () => {
    const partiallyConfirmed = confirmPartialDeduction(autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 })));
    const rescaled = rescalePantryMatch(partiallyConfirmed, 100, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    expect(rescaled.resolution).toBe('full');
    expect(rescaled.deductedQuantity).toBe(100);
  });

  it('a deliberate skip survives a servings change - it is quantity-independent', () => {
    const skipped = skipPantryDeduction(autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ quantity: 120 })));
    const rescaled = rescalePantryMatch(skipped, 50, 'g', 'ing-pasta', candidate({ quantity: 120 }));
    expect(rescaled.resolution).toBe('skipped');
    expect(rescaled.deductedQuantity).toBe(0);
  });
});

describe('selecting a replacement pantry item (remap)', () => {
  it('remapping to a different, sufficient-stock item auto-resolves to "full" via a fresh autoResolvePantryMatch call', () => {
    // Simulates the UI calling autoResolvePantryMatch again with the newly-selected candidate.
    const stuck = autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ id: 'low-stock', quantity: 120 }));
    expect(stuck.resolution).toBe('needs_decision');

    const remapped = autoResolvePantryMatch(500, 'g', 'ing-pasta', candidate({ id: 'replacement', ingredientId: 'ing-pasta', quantity: 900 }));
    expect(remapped.resolution).toBe('full');
    expect(remapped.pantryItemId).toBe('replacement');
    expect(remapped.deductedQuantity).toBe(500);
  });
});

describe('live stock changing after confirmation', () => {
  it('re-resolving against the item\'s current (lower) live stock downgrades an existing "full" resolution back to "needs_decision" rather than keeping a stale confirmation', () => {
    const confirmedFull = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate({ quantity: 500 }));
    expect(confirmedFull.resolution).toBe('full');

    // Something else (e.g. another cooking session) reduced live stock before Finish was pressed.
    const reResolved = autoResolvePantryMatch(200, 'g', 'ing-pasta', candidate({ quantity: 50 }));
    expect(reResolved.resolution).toBe('needs_decision');
    expect(reResolved.deductedQuantity).toBe(0);
    expect(reResolved.shortfall).toBe(150);
  });
});

describe('findCompatiblePantryCandidates', () => {
  const candidates: PantryMatchCandidate[] = [
    candidate({ id: 'a', unit: 'g', quantity: 500, status: 'active' }),
    candidate({ id: 'b', unit: 'oz', quantity: 20, status: 'active' }), // wrong unit
    candidate({ id: 'c', unit: 'g', quantity: 0, status: 'depleted' }), // depleted
    candidate({ id: 'd', unit: 'g', quantity: 300, status: 'active' }),
  ];

  it('only offers active, in-stock, unit-compatible candidates - never an incompatible or depleted one', () => {
    const result = findCompatiblePantryCandidates('g', candidates);
    expect(result.map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('returns nothing when no candidate has a matching unit', () => {
    expect(findCompatiblePantryCandidates('lb', candidates)).toEqual([]);
  });
});
