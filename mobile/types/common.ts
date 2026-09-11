/**
 * Shared value types used across multiple domains.
 */

export const QUANTITY_UNIT_VALUES = [
  'item',
  'container',
  'bag',
  'bottle',
  'can',
  'package',
  'serving',
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'L',
] as const;

export type QuantityUnit = (typeof QUANTITY_UNIT_VALUES)[number];

export const INGREDIENT_CATEGORY_VALUES = ['produce', 'protein', 'dairy', 'pantry', 'frozen', 'other'] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORY_VALUES)[number];

export interface Quantity {
  value: number;
  unit: QuantityUnit;
}
