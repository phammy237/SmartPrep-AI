import { NutritionSnapshot } from './nutrition';

export type PreparedMealStatus = 'available' | 'consumed' | 'discarded';

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
