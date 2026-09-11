import { QuantityUnit, IngredientCategory } from './common';

/** How a grocery line came to exist - provenance for future auto-generated lists. */
export const GROCERY_ITEM_SOURCE_VALUES = ['manual', 'recipe', 'meal_plan', 'pantry_shortage'] as const;
export type GroceryItemSource = (typeof GROCERY_ITEM_SOURCE_VALUES)[number];

/**
 * What a grocery line's `quantity` means. Explicit so quantities are never
 * silently reinterpreted:
 *  - as_entered           a human typed it
 *  - recipe_requirement   the full amount a recipe calls for (no pantry subtraction)
 *  - uncovered_shortfall  recipe requirement minus confirmed pantry coverage
 *                         (reserved - needs unit conversion before anything populates it)
 */
export const GROCERY_QUANTITY_BASIS_VALUES = ['as_entered', 'recipe_requirement', 'uncovered_shortfall'] as const;
export type GroceryQuantityBasis = (typeof GROCERY_QUANTITY_BASIS_VALUES)[number];

/** Whether an acquired grocery line has been turned into a pantry lot yet. */
export const PANTRY_TRANSFER_STATUS_VALUES = ['not_transferred', 'transferred'] as const;
export type PantryTransferStatus = (typeof PANTRY_TRANSFER_STATUS_VALUES)[number];

export interface GroceryListItem {
  id: string;
  ingredientId?: string;
  name: string;
  imageUri: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  isChecked: boolean;
  source?: GroceryItemSource;
  quantityBasis?: GroceryQuantityBasis;
  sourceRecipeIds?: string[];
  isManuallyAdded?: boolean;
  /** Generated line whose pantry comparison was unresolved - carries the conservative full requirement. */
  needsQuantityCheck?: boolean;
  /**
   * Whether this acquired line has been turned into a pantry lot. Independent of
   * `isChecked` ("acquired" and "in pantry" are separate facts). Set only via
   * the transfer flow (transfer_grocery_item_to_pantry).
   */
  pantryTransferStatus?: PantryTransferStatus;
  /** The pantry lot this line produced, once transferred. */
  pantryItemId?: string;
  estimatedPrice?: number;
  /** e.g. "Swap: Cucumber" - a lower-waste substitution suggestion. */
  swapSuggestion?: string;
  /** e.g. "Use stems in soup" - a tip to reduce waste from this item. */
  wasteNote?: string;
}

export interface GroceryList {
  id: string;
  createdAt: string;
  items: GroceryListItem[];
}

// ---------------------------------------------------------------------------
// Shopping-trip lifecycle (Phase 8). A grocery_lists row moves active ->
// completed; the completed list + its items ARE the history.
// ---------------------------------------------------------------------------

export const GROCERY_LIST_STATUS_VALUES = ['active', 'completed', 'archived'] as const;
export type GroceryListStatus = (typeof GROCERY_LIST_STATUS_VALUES)[number];

/** One row in Shopping History. Counts are derived, not stored. */
export interface GroceryTripSummary {
  id: string;
  status: GroceryListStatus;
  createdAt: string;
  /** Completed trips always have this. */
  completedAt: string;
  itemCount: number;
  /** is_checked = acquired. */
  acquiredCount: number;
  /** Lines that were turned into pantry lots. */
  transferredCount: number;
  /** First few item names, for a list preview. */
  itemPreview: string[];
}

/** A completed trip opened in read-only detail. */
export interface GroceryTripDetail extends GroceryTripSummary {
  items: GroceryListItem[];
}

/** What `completeShoppingTrip()` returns: the frozen trip + the fresh active list. */
export interface CompleteShoppingTripResult {
  completed: GroceryTripSummary;
  active: GroceryList;
}
