import { IngredientCategory, QuantityUnit } from './common';
import { NutritionFacts } from './nutrition';

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
  /** Nutrition for one fixed reference serving (see `servingDescription`) - not scaled by pantry quantity. */
  nutritionPerServing: NutritionFacts;
  /** e.g. "1/2 cup", "1 egg" - the serving `nutritionPerServing` describes. */
  servingDescription: string;
}
