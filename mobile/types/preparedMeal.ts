import { NutritionSnapshot } from './nutrition';

export const PREPARED_MEAL_STATUS_VALUES = ['available', 'consumed', 'discarded'] as const;
export type PreparedMealStatus = (typeof PREPARED_MEAL_STATUS_VALUES)[number];

export interface PreparedMeal {
  id: string;
  cookingEventId: string;
  recipeVersionId: string;
  totalServingsPrepared: number;
  servingsRemaining: number;
  totalBatchWeightG?: number;
  remainingBatchWeightG?: number;
  nutritionSnapshot: NutritionSnapshot;
  nutritionPerServing: NutritionSnapshot;
  /** Only present when a batch weight was recorded at completion time - never a fabricated conversion. */
  nutritionPerGram?: NutritionSnapshot;
  preparedAt: string;
  storageLocation?: string;
  useByDate?: string;
  status: PreparedMealStatus;
}
