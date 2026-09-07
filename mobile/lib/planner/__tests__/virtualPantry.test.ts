import { PantryItem } from '@/types';
import {
  buildVirtualPantry,
  consumeVirtualAllocation,
  probeVirtualAllocation,
  virtualLotsForIngredient,
} from '../virtualPantry';

const NOW = new Date('2026-06-10T12:00:00Z'); // today (UTC) = 2026-06-10

function pantryItem(over: Partial<PantryItem> = {}): PantryItem {
  return {
    id: `p-${Math.random().toString(36).slice(2)}`,
    ingredientId: 'ing-chicken-breast',
    name: 'Chicken Breast',
    imageUri: '',
    category: 'protein',
    quantity: 500,
    unit: 'g',
    freshness: { score: 50, confidence: 0.9, label: 'use_soon' },
    addedAt: 't',
    updatedAt: 't',
    source: 'manual',
    status: 'active',
    estimatedExpirationDate: '2026-06-11', // tomorrow -> critical
    expirationConfidence: 'high',
    ...over,
  };
}

const chicken = { ingredientId: 'ing-chicken-breast', name: 'Chicken Breast' };

describe('buildVirtualPantry', () => {
  it('deep-copies active in-stock lots and never mutates the source items', () => {
    const items = [pantryItem({ id: 'L1', quantity: 500 })];
    const vp = buildVirtualPantry(items, 'UTC', NOW);
    const lots = virtualLotsForIngredient(chicken, vp);
    expect(lots).toHaveLength(1);
    lots[0].remaining = 0;
    expect(items[0].quantity).toBe(500); // source untouched
  });

  it('excludes depleted / zero-quantity lots', () => {
    const vp = buildVirtualPantry(
      [
        pantryItem({ id: 'L1', quantity: 0 }),
        pantryItem({ id: 'L2', status: 'depleted', quantity: 100 }),
        pantryItem({ id: 'L3', quantity: 200 }),
      ],
      'UTC',
      NOW,
    );
    expect(virtualLotsForIngredient(chicken, vp).map((l) => l.lotId)).toEqual(['L3']);
  });
});

describe('probeVirtualAllocation (read-only)', () => {
  it('does not change virtual quantities', () => {
    const vp = buildVirtualPantry([pantryItem({ id: 'L1', quantity: 500 })], 'UTC', NOW);
    probeVirtualAllocation(vp, chicken, 300, 'g');
    expect(virtualLotsForIngredient(chicken, vp)[0].remaining).toBe(500);
  });

  it('reports urgent utilization + the worst urgent lot', () => {
    const vp = buildVirtualPantry([pantryItem({ id: 'L1', quantity: 500 })], 'UTC', NOW);
    const p = probeVirtualAllocation(vp, chicken, 300, 'g');
    expect(p).toMatchObject({ coveredQuantity: 300, urgentQuantityUtilized: 300, unresolvedRemainder: 0 });
    expect(p.worstUrgentLot?.expiryState).toBe('critical');
  });
});

describe('consumeVirtualAllocation (mutating, FEFO)', () => {
  it('500 g pantry vs two 400 g recipes -> stock is not counted twice', () => {
    const vp = buildVirtualPantry([pantryItem({ id: 'L1', quantity: 500 })], 'UTC', NOW);

    const first = consumeVirtualAllocation(vp, chicken, 400, 'g');
    expect(first.coveredQuantity).toBe(400);
    expect(virtualLotsForIngredient(chicken, vp)[0].remaining).toBe(100);

    const second = consumeVirtualAllocation(vp, chicken, 400, 'g');
    expect(second.coveredQuantity).toBe(100); // only 100 g left
    expect(second.unresolvedRemainder).toBe(300);
    expect(virtualLotsForIngredient(chicken, vp)[0].remaining).toBe(0);
  });

  it('consumes multiple lots FEFO (urgent lot first, then the later one)', () => {
    const vp = buildVirtualPantry(
      [
        pantryItem({ id: 'A', quantity: 200, estimatedExpirationDate: '2026-06-11' }), // critical
        pantryItem({ id: 'B', quantity: 500, estimatedExpirationDate: '2026-06-25' }), // fresh
      ],
      'UTC',
      NOW,
    );
    consumeVirtualAllocation(vp, chicken, 300, 'g');
    const lots = virtualLotsForIngredient(chicken, vp);
    expect(lots.find((l) => l.lotId === 'A')?.remaining).toBe(0);
    expect(lots.find((l) => l.lotId === 'B')?.remaining).toBe(400);
  });

  it('g/kg compatibility: a 1 kg requirement draws from g lots', () => {
    const vp = buildVirtualPantry(
      [pantryItem({ id: 'A', quantity: 500 }), pantryItem({ id: 'B', quantity: 600, estimatedExpirationDate: '2026-06-25' })],
      'UTC',
      NOW,
    );
    consumeVirtualAllocation(vp, chicken, 1, 'kg');
    const lots = virtualLotsForIngredient(chicken, vp);
    expect(lots.find((l) => l.lotId === 'A')?.remaining).toBe(0); // 500 g urgent lot fully used
    expect(lots.find((l) => l.lotId === 'B')?.remaining).toBe(100); // 600 - 500 g
  });

  it('density-backed conversion decrements the lot in its own unit', () => {
    const vp = buildVirtualPantry([pantryItem({ id: 'A', quantity: 600, unit: 'g' })], 'UTC', NOW);
    // 500 ml of a ~1 g/ml ingredient = 500 g
    consumeVirtualAllocation(vp, chicken, 500, 'ml', { densityGPerMl: 1 });
    expect(virtualLotsForIngredient(chicken, vp)[0].remaining).toBe(100);
  });

  it('unresolved units create NO fake virtual stock and do not decrement', () => {
    const vp = buildVirtualPantry([pantryItem({ id: 'A', quantity: 300, unit: 'g' })], 'UTC', NOW);
    const r = consumeVirtualAllocation(vp, chicken, 2, 'cup'); // g vs cup, no density
    expect(r.quantityUnresolved).toBe(true);
    expect(r.coveredQuantity).toBe(0);
    expect(virtualLotsForIngredient(chicken, vp)[0].remaining).toBe(300); // untouched
  });

  it('never mutates the real PantryItem objects', () => {
    const items = [pantryItem({ id: 'A', quantity: 500 })];
    const vp = buildVirtualPantry(items, 'UTC', NOW);
    consumeVirtualAllocation(vp, chicken, 400, 'g');
    expect(items[0].quantity).toBe(500);
  });
});
