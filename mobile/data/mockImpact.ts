import { KitchenImpact } from '@/types';

/**
 * Single source of truth for this month's impact stats - Home shows a
 * subset (ingredients used, food value), Profile shows the full picture.
 * Wording is deliberately careful: usage/utilization, never a safety or
 * environmental claim.
 */
export const MOCK_KITCHEN_IMPACT: KitchenImpact = {
  month: 'August 2026',
  ingredientsUsedBeforeFreshnessWindow: 18,
  estimatedFoodValueUtilized: 31,
  pantryUtilizationPercent: 87,
  itemsDiscarded: 6,
};
