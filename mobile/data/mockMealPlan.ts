import { MealPlan, MealPlanItem } from '@/types';

const WEEK_START = '2026-08-10';

const DATES: Record<MealPlanItem['day'], string> = {
  mon: '2026-08-10',
  tue: '2026-08-11',
  wed: '2026-08-12',
  thu: '2026-08-13',
  fri: '2026-08-14',
  sat: '2026-08-15',
  sun: '2026-08-16',
};

/**
 * Front-loads recipes that use Prioritize/Use Soon pantry ingredients
 * (spinach, avocado, bread, ground beef, chicken, broccoli) earlier in the
 * week, per the product rule that Generate My Week should surface
 * at-risk ingredients first.
 */
const seeds: Pick<MealPlanItem, 'day' | 'mealType' | 'recipeId'>[] = [
  { day: 'mon', mealType: 'breakfast', recipeId: 'recipe-strawberry-parfait' },
  { day: 'mon', mealType: 'dinner', recipeId: 'recipe-creamy-spinach-pasta' },
  { day: 'tue', mealType: 'lunch', recipeId: 'recipe-avocado-toast' },
  { day: 'tue', mealType: 'dinner', recipeId: 'recipe-beef-broccoli' },
  { day: 'wed', mealType: 'breakfast', recipeId: 'recipe-veggie-omelet' },
  { day: 'wed', mealType: 'dinner', recipeId: 'recipe-chicken-teriyaki-bowl' },
  { day: 'thu', mealType: 'lunch', recipeId: 'recipe-black-bean-tacos' },
  { day: 'thu', mealType: 'dinner', recipeId: 'recipe-veggie-fried-rice' },
  { day: 'fri', mealType: 'breakfast', recipeId: 'recipe-berry-bark' },
  { day: 'fri', mealType: 'dinner', recipeId: 'recipe-beef-chili' },
  { day: 'sat', mealType: 'dinner', recipeId: 'recipe-tomato-soup' },
  { day: 'sun', mealType: 'dinner', recipeId: 'recipe-caprese-pasta-salad' },
];

export const MOCK_MEAL_PLAN: MealPlan = {
  id: 'plan-current-week',
  weekStartDate: WEEK_START,
  items: seeds.map((seed, index) => ({
    id: `plan-item-${index + 1}`,
    date: DATES[seed.day],
    ...seed,
  })),
};
