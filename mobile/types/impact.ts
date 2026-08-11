export interface KitchenImpact {
  /** e.g. "August 2026" */
  month: string;
  ingredientsUsedBeforeFreshnessWindow: number;
  estimatedFoodValueUtilized: number;
  pantryUtilizationPercent: number;
  itemsDiscarded: number;
  /** Estimated, not measured - phrased as an estimate everywhere it's shown. */
  estimatedFoodSavedLbs: number;
  cookingStreakDays: number;
}
