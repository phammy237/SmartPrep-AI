/**
 * Shared value types used across multiple domains.
 */

export type QuantityUnit =
  | 'item'
  | 'container'
  | 'bag'
  | 'bottle'
  | 'can'
  | 'package'
  | 'serving'
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'ml'
  | 'L';

export type IngredientCategory = 'produce' | 'protein' | 'dairy' | 'pantry' | 'frozen' | 'other';

export interface Quantity {
  value: number;
  unit: QuantityUnit;
}
