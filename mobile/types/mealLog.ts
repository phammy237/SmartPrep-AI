import { MealType } from './mealPlan';
import { NutritionSnapshot, NutritionStatus } from './nutrition';

export const MEAL_LOG_SOURCE_VALUES = ['cooking_flow', 'prepared_meal', 'quick_add', 'manual'] as const;
export type MealLogSource = (typeof MEAL_LOG_SOURCE_VALUES)[number];

/** An immutable consumed-nutrition record. Totals must always read `nutritionSnapshot`, never look up the live recipe. */
export interface MealLog {
  id: string;
  consumedAt: string;
  localDate: string;
  timezone: string;
  mealType: MealType;
  recipeVersionId?: string;
  cookingEventId?: string;
  preparedMealId?: string;
  servingsConsumed?: number;
  gramsConsumed?: number;
  nutritionSnapshot: NutritionSnapshot;
  nutritionStatus: NutritionStatus;
  logSource: MealLogSource;
  notes?: string;
  /** Set once a log has been superseded by a correction (see correct_meal_log) - never un-set, never re-set. */
  voidedAt?: string;
  voidReason?: string;
  replacedByLogId?: string;
  createdAt: string;
}
