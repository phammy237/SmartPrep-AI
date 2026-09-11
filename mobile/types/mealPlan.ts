/** Still used by features/planner/constants.ts for the week grid labels. */
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const MEAL_TYPE_VALUES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPE_VALUES)[number];

// ============================================================================
// The real (Supabase-backed) planner - meal_plan_items rows.
// ============================================================================

export const MEAL_PLAN_STATUS_VALUES = ['planned', 'completed', 'skipped', 'cancelled'] as const;
export type MealPlanStatus = (typeof MEAL_PLAN_STATUS_VALUES)[number];

export interface MealPlanEntry {
  id: string;
  /** YYYY-MM-DD, interpreted in `timezone`. */
  scheduledDate: string;
  /** HH:MM, optional. */
  scheduledTime?: string;
  timezone: string;
  mealSlot: MealType;
  recipeVersionId: string;
  plannedServings: number;
  status: MealPlanStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
