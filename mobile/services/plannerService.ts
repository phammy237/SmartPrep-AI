import {
  createMealPlanEntry,
  deleteMealPlanEntry,
  deletePlannedEntriesInRange,
  fetchMealPlanEntries,
  fetchPantryItems,
  updateMealPlanEntry,
} from '@/lib/supabase/repositories';
import { CreateMealPlanEntryInput, UpdateMealPlanEntryInput } from '@/lib/validation/plannerSchemas';
import { MealPlanEntry, PantryItem, Recipe } from '@/types';
import { requireUserId } from './requireUserId';
import { recipeService } from './recipeService';

async function getMealPlanForWeek(weekStart: string, weekEnd: string): Promise<MealPlanEntry[]> {
  const userId = await requireUserId();
  return fetchMealPlanEntries(userId, weekStart, weekEnd);
}

async function addMealPlanEntry(input: CreateMealPlanEntryInput): Promise<MealPlanEntry> {
  const userId = await requireUserId();
  return createMealPlanEntry(userId, input);
}

/** Marking an entry 'completed'/'skipped'/'cancelled' is a plain status write - it never creates a meal log. */
async function updatePlanEntry(id: string, patch: UpdateMealPlanEntryInput): Promise<MealPlanEntry> {
  return updateMealPlanEntry(id, patch);
}

async function removeMealPlanEntry(id: string): Promise<void> {
  return deleteMealPlanEntry(id);
}

/** Higher = more urgent to cook soon, based on Prioritize/Use Soon pantry items it uses - same deterministic heuristic the mock planner used, now against real data. */
function recipeUrgency(recipe: Recipe, pantry: PantryItem[]): number {
  const pantryByIngredient = new Map(pantry.map((item) => [item.ingredientId, item]));
  return recipe.ingredients.reduce((score, ingredient) => {
    const pantryItem = pantryByIngredient.get(ingredient.ingredientId);
    if (!pantryItem) return score;
    if (pantryItem.freshness.label === 'prioritize') return score + 2;
    if (pantryItem.freshness.label === 'use_soon') return score + 1;
    return score;
  }, 0);
}

function eachDateInRange(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const endTime = new Date(`${endDate}T00:00:00Z`).getTime();
  const dates: string[] = [];
  while (cursor.getTime() <= endTime) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Regenerates the week's dinners, front-loading recipes that use
 * Prioritize/Use Soon ingredients - clears only still-planned dinner entries
 * in this range first (never touches completed/skipped/cancelled history),
 * then creates one real meal_plan_items row per day.
 */
async function generateWeek(weekStart: string, weekEnd: string, timeZone: string): Promise<MealPlanEntry[]> {
  const userId = await requireUserId();
  const [recipes, pantry] = await Promise.all([recipeService.getRecipes(), fetchPantryItems(userId, timeZone)]);
  if (recipes.length === 0) {
    return fetchMealPlanEntries(userId, weekStart, weekEnd);
  }

  const ranked = [...recipes].sort(
    (a, b) => recipeUrgency(b, pantry) - recipeUrgency(a, pantry) || b.smartMatchScore - a.smartMatchScore,
  );

  await deletePlannedEntriesInRange(userId, 'dinner', weekStart, weekEnd);

  const dates = eachDateInRange(weekStart, weekEnd);
  const created = await Promise.all(
    dates.map((date, index) => {
      const recipe = ranked[index % ranked.length];
      return createMealPlanEntry(userId, {
        scheduledDate: date,
        timezone: timeZone,
        mealSlot: 'dinner',
        recipeVersionId: recipe.recipeVersionId ?? recipe.id,
        plannedServings: recipe.servings,
      });
    }),
  );

  return created;
}

export const plannerService = {
  getMealPlanForWeek,
  addMealPlanEntry,
  updateMealPlanEntry: updatePlanEntry,
  removeMealPlanEntry,
  generateWeek,
};
