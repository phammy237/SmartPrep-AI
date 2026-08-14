export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
/** 'snack' added in Phase 3 for quick-add logging; the legacy mock planner (data/mockMealPlan.ts) never uses it. */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlanItem {
  id: string;
  day: DayOfWeek;
  /** ISO date for this day within the plan's week. */
  date: string;
  mealType: MealType;
  recipeId: string;
}

export interface MealPlan {
  id: string;
  /** ISO date of the Monday this plan starts on. */
  weekStartDate: string;
  items: MealPlanItem[];
}

// ============================================================================
// Phase 3: real (Supabase-backed) planner. Distinct from the legacy
// MealPlanItem/MealPlan above (which data/mockMealPlan.ts still uses, kept
// in place though no longer read by plannerService).
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
