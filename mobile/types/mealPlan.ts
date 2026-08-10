export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type MealType = 'breakfast' | 'lunch' | 'dinner';

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
