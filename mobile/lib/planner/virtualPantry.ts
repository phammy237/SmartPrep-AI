/**
 * Generation-time VIRTUAL pantry allocation.
 *
 * When `Generate My Week` scores recipes it must not let the same 500 g of
 * chicken make three different recipes each look "fully pantry-covered". So it
 * builds an in-memory copy of the pantry lots and virtually consumes each
 * recipe's requirements (FEFO) as it selects it, ranking the next recipe
 * against what's LEFT.
 *
 * This never touches real `pantry_items` and never persists. Actual cooking
 * deduction stays governed by the cooking-confirmation flow. All FEFO / unit
 * math is delegated to `lib/freshness/lotAllocation` - this module only holds
 * the mutable running quantities.
 */

import { INGREDIENTS_BY_ID, normalizeIngredientName } from '@/data';
import { IngredientConversionMeta } from '@/lib/nutrition/conversion';
import {
  ExpiringLot,
  ExpiryState,
  allocateIngredientRequirementToLots,
  assessPantryItemExpiry,
} from '@/lib/freshness';
import { PantryItem } from '@/types';

export interface VirtualLot {
  lotId: string;
  ingredientId: string;
  /** Running quantity in `unit`. Decremented as recipes are virtually consumed. */
  remaining: number;
  unit: string;
  expiryState: ExpiryState;
  expirationDate?: string;
  daysUntilExpiry?: number;
  isUserConfirmedDate: boolean;
}

export interface VirtualPantry {
  /** canonical ingredient id -> its lots (the SAME lot objects also live in `byName`). */
  byId: Map<string, VirtualLot[]>;
  /** normalized-name fallback, only consulted for recipe ingredients with no catalog id. */
  byName: Map<string, VirtualLot[]>;
}

/** Deep copy of the active, in-stock pantry as mutable virtual lots. Never mutates `pantry`. */
export function buildVirtualPantry(pantry: PantryItem[], timeZone: string, now: Date): VirtualPantry {
  const byId = new Map<string, VirtualLot[]>();
  const byName = new Map<string, VirtualLot[]>();
  const push = (m: Map<string, VirtualLot[]>, k: string, lot: VirtualLot) => {
    const a = m.get(k);
    if (a) a.push(lot);
    else m.set(k, [lot]);
  };

  for (const item of pantry) {
    if (item.status === 'depleted') continue;
    if (!(typeof item.quantity === 'number' && item.quantity > 0)) continue;
    const expiry = assessPantryItemExpiry(item, timeZone, now);
    const lot: VirtualLot = {
      lotId: item.id,
      ingredientId: item.ingredientId,
      remaining: item.quantity,
      unit: item.unit,
      expiryState: expiry.state,
      expirationDate: expiry.expirationDate,
      daysUntilExpiry: expiry.daysUntilExpiry ?? undefined,
      isUserConfirmedDate: expiry.isUserConfirmedDate,
    };
    push(byId, item.ingredientId, lot);
    const nn = item.normalizedName ?? normalizeIngredientName(item.name);
    if (nn) push(byName, nn, lot);
  }
  return { byId, byName };
}

/** Canonical id first; exact normalized-name fallback only when the ingredient has no catalog id. Never fuzzy. */
export function virtualLotsForIngredient(
  ingredient: { ingredientId: string; name: string },
  vp: VirtualPantry,
): VirtualLot[] {
  const byId = vp.byId.get(ingredient.ingredientId);
  if (byId && byId.length > 0) return byId;
  if (!INGREDIENTS_BY_ID[ingredient.ingredientId]) {
    return vp.byName.get(normalizeIngredientName(ingredient.name)) ?? [];
  }
  return [];
}

function toExpiringLots(lots: VirtualLot[]): ExpiringLot[] {
  return lots.map((l) => ({
    lotId: l.lotId,
    quantity: l.remaining,
    unit: l.unit,
    expiry: {
      state: l.expiryState,
      daysUntilExpiry: l.daysUntilExpiry ?? null,
      isUserConfirmedDate: l.isUserConfirmedDate,
      isEstimatedDate: !l.isUserConfirmedDate,
      expirationDate: l.expirationDate,
      phrase: '',
    },
  }));
}

export interface VirtualAllocationProbe {
  /** Requirement met from current virtual stock, in the allocation's covered unit. */
  coveredQuantity: number;
  coveredUnit: string;
  /** Of that, how much came from lots in an urgent (expired/critical/use_soon) state. */
  urgentQuantityUtilized: number;
  /** Requirement still unmet by virtual stock (covered unit). */
  unresolvedRemainder: number;
  /** Units couldn't be compared - identity match only, no fabricated quantity. */
  quantityUnresolved: boolean;
  /** The most-urgent virtual lot this ingredient matched (for the scheduling-urgency signal). */
  worstUrgentLot?: Pick<VirtualLot, 'expiryState' | 'expirationDate' | 'daysUntilExpiry' | 'isUserConfirmedDate'>;
}

function pickWorstUrgent(lots: VirtualLot[]): VirtualLot | undefined {
  const urgent = lots.filter((l) => l.expiryState === 'expired' || l.expiryState === 'critical' || l.expiryState === 'use_soon');
  if (urgent.length === 0) return undefined;
  const rank: Record<ExpiryState, number> = { expired: 0, critical: 1, use_soon: 2, unknown: 3, fresh: 4 };
  return [...urgent].sort((a, b) => {
    const r = rank[a.expiryState] - rank[b.expiryState];
    if (r !== 0) return r;
    const da = a.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
    const db = b.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0;
  })[0];
}

/**
 * READ-ONLY: how the given requirement would draw on current virtual stock.
 * Does not decrement - used while scoring candidates for a slot.
 *
 * @param scaledQuantity  requirement already multiplied by (plannedServings / recipe.servings)
 */
export function probeVirtualAllocation(
  vp: VirtualPantry,
  ingredient: { ingredientId: string; name: string },
  scaledQuantity: number,
  unit: string,
  conversionMeta?: IngredientConversionMeta,
): VirtualAllocationProbe {
  const lots = virtualLotsForIngredient(ingredient, vp);
  const alloc = allocateIngredientRequirementToLots(scaledQuantity, unit, toExpiringLots(lots), conversionMeta);
  const worst = pickWorstUrgent(lots);
  return {
    coveredQuantity: alloc.coveredQuantity,
    coveredUnit: alloc.coveredUnit,
    urgentQuantityUtilized: alloc.urgentQuantityUtilized,
    unresolvedRemainder: alloc.unresolvedRemainder,
    quantityUnresolved: alloc.quantityUnresolved,
    worstUrgentLot: worst
      ? {
          expiryState: worst.expiryState,
          expirationDate: worst.expirationDate,
          daysUntilExpiry: worst.daysUntilExpiry,
          isUserConfirmedDate: worst.isUserConfirmedDate,
        }
      : undefined,
  };
}

/**
 * MUTATES `vp`: decrement virtual lots by the FEFO amounts this requirement
 * would consume. Call once per non-staple ingredient after a recipe is chosen.
 * Returns the same probe shape describing what was consumed.
 */
export function consumeVirtualAllocation(
  vp: VirtualPantry,
  ingredient: { ingredientId: string; name: string },
  scaledQuantity: number,
  unit: string,
  conversionMeta?: IngredientConversionMeta,
): VirtualAllocationProbe {
  const lots = virtualLotsForIngredient(ingredient, vp);
  const alloc = allocateIngredientRequirementToLots(scaledQuantity, unit, toExpiringLots(lots), conversionMeta);

  for (const used of alloc.lotsUsed) {
    const lot = lots.find((l) => l.lotId === used.lotId);
    if (lot) lot.remaining = Math.max(0, Number((lot.remaining - used.lotUnitTaken).toFixed(3)));
  }

  const worst = pickWorstUrgent(lots);
  return {
    coveredQuantity: alloc.coveredQuantity,
    coveredUnit: alloc.coveredUnit,
    urgentQuantityUtilized: alloc.urgentQuantityUtilized,
    unresolvedRemainder: alloc.unresolvedRemainder,
    quantityUnresolved: alloc.quantityUnresolved,
    worstUrgentLot: worst
      ? {
          expiryState: worst.expiryState,
          expirationDate: worst.expirationDate,
          daysUntilExpiry: worst.daysUntilExpiry,
          isUserConfirmedDate: worst.isUserConfirmedDate,
        }
      : undefined,
  };
}
