/**
 * Turning the live pantry into the "usable lots for this ingredient" sets that
 * quantity-aware coverage works from. Shared by recipeService (per-recipe
 * coverage) and plannerService (plan-level aggregate demand) so both match
 * pantry stock the exact same way - canonical id first, an EXACT
 * normalized-name fallback only when the ingredient has no catalog id, never
 * fuzzy.
 */

import { INGREDIENTS_BY_ID, normalizeIngredientName } from '@/data';
import { PantryItem } from '@/types';
import { PantryLot } from './pantryCoverage';

export interface PantryLotIndex {
  byId: Map<string, PantryLot[]>;
  byName: Map<string, PantryLot[]>;
}

/**
 * Group in-stock pantry lots by canonical ingredient id and (for the
 * no-catalog-id fallback) by normalized name. Depleted / zero-quantity /
 * non-positive lots are excluded - they are not usable stock.
 */
export function indexPantryLots(pantry: PantryItem[]): PantryLotIndex {
  const byId = new Map<string, PantryLot[]>();
  const byName = new Map<string, PantryLot[]>();
  const push = (map: Map<string, PantryLot[]>, key: string, lot: PantryLot) => {
    const list = map.get(key);
    if (list) list.push(lot);
    else map.set(key, [lot]);
  };

  for (const item of pantry) {
    if (item.status === 'depleted') continue;
    if (!(typeof item.quantity === 'number' && item.quantity > 0)) continue;
    const lot: PantryLot = { quantity: item.quantity, unit: item.unit };
    push(byId, item.ingredientId, lot);
    const nn = item.normalizedName ?? normalizeIngredientName(item.name);
    if (nn) push(byName, nn, lot);
  }
  return { byId, byName };
}

/**
 * Lots for one ingredient. Canonical id is the primary key; a normalized-name
 * fallback is used ONLY when `ingredientId` is not a real catalog id (i.e. it
 * is a recipe_ingredients row id), and even then only on an EXACT
 * normalized-name match.
 */
export function lotsForIngredient(
  ingredient: { ingredientId: string; name: string },
  index: PantryLotIndex,
): PantryLot[] {
  const byId = index.byId.get(ingredient.ingredientId);
  if (byId && byId.length > 0) return byId;
  if (!INGREDIENTS_BY_ID[ingredient.ingredientId]) {
    return index.byName.get(normalizeIngredientName(ingredient.name)) ?? [];
  }
  return [];
}
