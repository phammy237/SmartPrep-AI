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
}

export interface GroceryList {
  id: string;
  createdAt: string;
  items: GroceryListItem[];
}
