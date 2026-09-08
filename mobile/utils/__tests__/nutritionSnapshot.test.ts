import { NutritionSnapshot } from '@/types';
import {
  checkMacroCalorieConsistency,
  dailyNutritionTotal,
  isAllowedCookingTransition,
  isAllowedPlanTransition,
  localWeekRange,
  scaleNutritionSnapshot,
  scaleRequestedQuantity,
  selectEffectiveGoal,
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
