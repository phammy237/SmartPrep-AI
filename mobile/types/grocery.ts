import { QuantityUnit, IngredientCategory } from './common';

export interface GroceryListItem {
  id: string;
  ingredientId?: string;
  name: string;
  imageUri: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  isChecked: boolean;
  sourceRecipeIds?: string[];
  isManuallyAdded?: boolean;
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
