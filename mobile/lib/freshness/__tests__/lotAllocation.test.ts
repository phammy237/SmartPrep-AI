import { ExpiringLot, allocateIngredientRequirementToLots } from '../lotAllocation';
import { assessExpiry } from '../expiryModel';

const NOW = new Date('2026-06-10T12:00:00Z'); // today = 2026-06-10 (UTC)

function lot(lotId: string, quantity: number, unit: string, expDate?: string): ExpiringLot {
  return {
    lotId,
    quantity,
    unit,
    expiry: assessExpiry({
      estimatedExpirationDate: expDate,
      expirationConfidence: expDate ? 'high' : 'unknown',
      timeZone: 'UTC',
      now: NOW,
    }),
  };
}

describe('allocateIngredientRequirementToLots - single lot', () => {
  it('covers the requirement from one urgent lot', () => {
    const a = allocateIngredientRequirementToLots(200, 'g', [lot('L1', 500, 'g', '2026-06-11')]);
    expect(a).toMatchObject({
      coveredQuantity: 200,
      coveredUnit: 'g',
      urgentQuantityUtilized: 200,
      unresolvedRemainder: 0,
      quantityUnresolved: false,
      hasUrgentLot: true,
    });
    expect(a.lotsUsed).toEqual([{ lotId: 'L1', takenQuantity: 200, unit: 'g', expiryState: 'critical', lotUnitTaken: 200 }]);
  });

  it('reports the remainder when one lot is not enough', () => {
    const a = allocateIngredientRequirementToLots(600, 'g', [lot('L1', 200, 'g', '2026-06-11')]);
    expect(a.coveredQuantity).toBe(200);
    expect(a.unresolvedRemainder).toBe(400);
    expect(a.urgentQuantityUtilized).toBe(200);
  });
});

describe('allocateIngredientRequirementToLots - multiple lots / FEFO', () => {
  const urgent = lot('A', 200, 'g', '2026-06-11'); // critical
  const later = lot('B', 500, 'g', '2026-06-25'); // fresh

  it('uses the earliest-expiring lot first, spanning into the later one', () => {
    const a = allocateIngredientRequirementToLots(300, 'g', [later, urgent]); // deliberately out of order
    expect(a.lotsUsed).toEqual([
      { lotId: 'A', takenQuantity: 200, unit: 'g', expiryState: 'critical', lotUnitTaken: 200 },
      { lotId: 'B', takenQuantity: 100, unit: 'g', expiryState: 'fresh', lotUnitTaken: 100 },
    ]);
    expect(a.urgentQuantityUtilized).toBe(200); // only the critical lot counts
    expect(a.coveredQuantity).toBe(300);
    expect(a.unresolvedRemainder).toBe(0);
  });

  it('result is identical regardless of input array order', () => {
    const x = allocateIngredientRequirementToLots(300, 'g', [urgent, later]);
    const y = allocateIngredientRequirementToLots(300, 'g', [later, urgent]);
    expect(x).toEqual(y);
  });

  it('fully consumes the urgent lot when the requirement matches it exactly', () => {
    const a = allocateIngredientRequirementToLots(200, 'g', [urgent, later]);
    expect(a.lotsUsed).toEqual([{ lotId: 'A', takenQuantity: 200, unit: 'g', expiryState: 'critical', lotUnitTaken: 200 }]);
    expect(a.urgentQuantityUtilized).toBe(200);
  });

  it('partially consumes the urgent lot when the requirement is smaller', () => {
    const a = allocateIngredientRequirementToLots(120, 'g', [urgent, later]);
    expect(a.lotsUsed).toEqual([{ lotId: 'A', takenQuantity: 120, unit: 'g', expiryState: 'critical', lotUnitTaken: 120 }]);
    expect(a.urgentQuantityUtilized).toBe(120);
  });

  it('breaks FEFO ties on lotId so the order is stable', () => {
    const p = lot('P', 100, 'g', '2026-06-11');
    const q = lot('Q', 100, 'g', '2026-06-11');
    const a = allocateIngredientRequirementToLots(150, 'g', [q, p]);
    expect(a.lotsUsed.map((l) => l.lotId)).toEqual(['P', 'Q']);
  });
});

describe('allocateIngredientRequirementToLots - unit handling', () => {
  it('converts through the mass engine (kg + g -> g)', () => {
    const a = allocateIngredientRequirementToLots(1, 'kg', [
      lot('A', 500, 'g', '2026-06-11'),
      lot('B', 600, 'g', '2026-06-25'),
    ]);
    expect(a.coveredUnit).toBe('g');
    expect(a.coveredQuantity).toBe(1000);
    expect(a.urgentQuantityUtilized).toBe(500); // from the critical lot
    expect(a.unresolvedRemainder).toBe(0);
  });

  it('uses ingredient density for a volume<->mass comparison when metadata is present', () => {
    // required 500 ml of a ~1 g/ml ingredient = 500 g; a 600 g lot covers it.
    const a = allocateIngredientRequirementToLots(500, 'ml', [lot('A', 600, 'g', '2026-06-11')], {
      densityGPerMl: 1,
    });
    expect(a.quantityUnresolved).toBe(false);
    expect(a.coveredUnit).toBe('g');
    expect(a.coveredQuantity).toBe(500);
    expect(a.urgentQuantityUtilized).toBe(500);
  });

  it('marks the relationship unresolved when units cannot be compared (no metadata)', () => {
    const a = allocateIngredientRequirementToLots(2, 'cup', [lot('A', 300, 'g', '2026-06-11')]);
    expect(a).toMatchObject({
      quantityUnresolved: true,
      coveredQuantity: 0,
      urgentQuantityUtilized: 0,
      hasUrgentLot: true,
    });
    expect(a.unresolvedRemainder).toBe(2);
    expect(a.lotsUsed).toEqual([]);
  });

  it('count vs volume with no metadata is unresolved, not fabricated', () => {
    const a = allocateIngredientRequirementToLots(2, 'cup', [lot('A', 3, 'item', '2026-06-11')]);
    expect(a.quantityUnresolved).toBe(true);
    expect(a.coveredQuantity).toBe(0);
  });

  it('an invalid required quantity is unresolved, never a guess', () => {
    const a = allocateIngredientRequirementToLots(0, 'g', [lot('A', 100, 'g', '2026-06-11')]);
    expect(a.quantityUnresolved).toBe(true);
  });
});

describe('allocateIngredientRequirementToLots - lot filtering', () => {
  it('ignores zero / non-positive lots', () => {
    const a = allocateIngredientRequirementToLots(100, 'g', [
      lot('Z', 0, 'g', '2026-06-11'),
      lot('A', 200, 'g', '2026-06-11'),
    ]);
    expect(a.lotsUsed.map((l) => l.lotId)).toEqual(['A']);
    expect(a.coveredQuantity).toBe(100);
  });

  it('no usable lots -> covered 0, remainder = requirement', () => {
    const a = allocateIngredientRequirementToLots(100, 'g', []);
    expect(a).toMatchObject({ coveredQuantity: 0, unresolvedRemainder: 100, quantityUnresolved: false, hasUrgentLot: false });
  });

  it('a lot with an unknown expiry date still participates but is not "urgent"', () => {
    const a = allocateIngredientRequirementToLots(100, 'g', [lot('U', 300, 'g')]);
    expect(a.coveredQuantity).toBe(100);
    expect(a.urgentQuantityUtilized).toBe(0);
    expect(a.hasUrgentLot).toBe(false);
  });
});
