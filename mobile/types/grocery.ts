import { QuantityUnit, IngredientCategory } from './common';

/** How a grocery line came to exist - provenance for future auto-generated lists. */
export type GroceryItemSource = 'manual' | 'recipe' | 'meal_plan' | 'pantry_shortage';

/**
 * What a grocery line's `quantity` means. Explicit so quantities are never
 * silently reinterpreted:
 *  - as_entered           a human typed it
 *  - recipe_requirement   the full amount a recipe calls for (no pantry subtraction)
 *  - uncovered_shortfall  recipe requirement minus confirmed pantry coverage
 *                         (reserved - needs unit conversion before anything populates it)
 */
export type GroceryQuantityBasis = 'as_entered' | 'recipe_requirement' | 'uncovered_shortfall';

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
