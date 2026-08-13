import { PantryItemStatus } from '@/types';

/** The only two legal status transitions: active -> depleted, and depleted -> active (restore). Everything else, including a same-state "transition," is invalid. */
export function canTransitionPantryStatus(from: PantryItemStatus, to: PantryItemStatus): boolean {
  if (from === to) return false;
  return (from === 'active' && to === 'depleted') || (from === 'depleted' && to === 'active');
}

/** A quantity is valid if it's a finite, non-negative number - matches the DB's `quantity >= 0` check constraint. */
export function isValidQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/** Mirrors the DB's rejection rule in adjust_pantry_quantity: a deduction may never take stock below zero. */
export function wouldGoNegative(currentQuantity: number, delta: number): boolean {
  return currentQuantity + delta < 0;
}

/** Zero quantity always means depleted; any positive quantity always means active - this is the single source of truth the UI and the adjust_pantry_quantity RPC both follow. */
export function statusForQuantity(quantity: number): PantryItemStatus {
  return quantity <= 0 ? 'depleted' : 'active';
}
