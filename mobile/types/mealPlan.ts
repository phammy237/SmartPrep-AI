/** Still used by features/planner/constants.ts for the week grid labels. */
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// ============================================================================
// The real (Supabase-backed) planner - meal_plan_items rows.
// ============================================================================

export type MealPlanStatus = 'planned' | 'completed' | 'skipped' | 'cancelled';

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
