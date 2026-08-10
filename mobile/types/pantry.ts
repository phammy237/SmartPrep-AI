import { IngredientCategory, QuantityUnit } from './common';
import { FreshnessState } from './freshness';

export type PantryItemSource = 'scan' | 'manual' | 'grocery';

export interface PantryItem {
  id: string;
  ingredientId: string;
  /** Denormalized for fast list rendering. */
  name: string;
  imageUri: string;
  category: IngredientCategory;
  quantity: number;
  unit: QuantityUnit;
  freshness: FreshnessState;
  addedAt: string;
  updatedAt: string;
  source: PantryItemSource;
  notes?: string;
}
