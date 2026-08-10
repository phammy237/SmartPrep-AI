import { IngredientCategory, QuantityUnit } from './common';

/**
 * Canonical catalog entry for an ingredient - the "what is this" record.
 * PantryItem, ScanDetection, RecipeIngredient, GroceryListItem all reference
 * one of these via ingredientId, but also denormalize name/imageUri/category
 * onto themselves for fast list rendering without a catalog lookup.
 */
export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  /** Real photo URL representing this ingredient. */
  imageUri: string;
  defaultUnit: QuantityUnit;
}
