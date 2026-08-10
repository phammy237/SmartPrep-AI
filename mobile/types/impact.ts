export interface KitchenImpact {
  /** e.g. "August 2026" */
  month: string;
  ingredientsUsedBeforeFreshnessWindow: number;
  estimatedFoodValueUtilized: number;
  pantryUtilizationPercent: number;
  itemsDiscarded: number;
}
