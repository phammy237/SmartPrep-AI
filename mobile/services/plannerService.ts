import { DayOfWeek, MealPlan, MealPlanItem, MealType } from '@/types';
import { generateId } from '@/utils/id';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateForDay(weekStart: Date, day: DayOfWeek): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + DAY_ORDER.indexOf(day));
  return d.toISOString().slice(0, 10);
}

/** Higher = more urgent to cook soon, based on Prioritize/Use Soon pantry items it uses. */
function recipeUrgency(recipe: (typeof db.recipes)[number]): number {
  const pantryByIngredient = new Map(db.pantry.map((item) => [item.ingredientId, item]));
  return recipe.ingredients.reduce((score, ingredient) => {
    const pantryItem = pantryByIngredient.get(ingredient.ingredientId);
    if (!pantryItem) return score;
    if (pantryItem.freshness.label === 'prioritize') return score + 2;
    if (pantryItem.freshness.label === 'use_soon') return score + 1;
    return score;
  }, 0);
}

async function getMealPlan(): Promise<MealPlan> {
  await delay();
  return clone(db.mealPlan);
}

async function addMealPlanItem(day: DayOfWeek, mealType: MealType, recipeId: string): Promise<MealPlanItem> {
  await delay(300);
  const weekStart = new Date(db.mealPlan.weekStartDate);
  const item: MealPlanItem = {
    id: generateId('plan-item'),
    day,
    date: dateForDay(weekStart, day),
    mealType,
    recipeId,
  };
  db.mealPlan.items.push(item);
  return clone(item);
}

async function replaceMealPlanItem(itemId: string, recipeId: string): Promise<MealPlanItem> {
  await delay(300);
  const item = db.mealPlan.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Meal plan item ${itemId} not found`);
  item.recipeId = recipeId;
  return clone(item);
}

async function removeMealPlanItem(itemId: string): Promise<void> {
  await delay(250);
  db.mealPlan.items = db.mealPlan.items.filter((i) => i.id !== itemId);
}

async function moveMealPlanItem(itemId: string, day: DayOfWeek, mealType: MealType): Promise<MealPlanItem> {
  await delay(300);
  const item = db.mealPlan.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Meal plan item ${itemId} not found`);
  const weekStart = new Date(db.mealPlan.weekStartDate);
  item.day = day;
  item.mealType = mealType;
  item.date = dateForDay(weekStart, day);
  return clone(item);
}

/** Regenerates the week's dinners, front-loading recipes that use Prioritize/Use Soon ingredients. */
async function generateWeek(): Promise<MealPlan> {
  await delay(900);
  const weekStart = mondayOf(new Date());
  const ranked = [...db.recipes].sort((a, b) => recipeUrgency(b) - recipeUrgency(a) || b.smartMatchScore - a.smartMatchScore);

  const items: MealPlanItem[] = DAY_ORDER.map((day, index) => ({
    id: generateId('plan-item'),
    day,
    date: dateForDay(weekStart, day),
    mealType: 'dinner' as MealType,
    recipeId: ranked[index % ranked.length].id,
  }));

  db.mealPlan = {
    id: db.mealPlan.id,
    weekStartDate: weekStart.toISOString().slice(0, 10),
    items,
  };
  return clone(db.mealPlan);
}

export const plannerService = {
  getMealPlan,
  addMealPlanItem,
  replaceMealPlanItem,
  removeMealPlanItem,
  moveMealPlanItem,
  generateWeek,
};
