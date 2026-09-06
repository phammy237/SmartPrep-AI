import { MOCK_MEAL_PLAN, MOCK_PANTRY, MOCK_RECIPES, MOCK_SCAN_HISTORY, MOCK_USER } from '@/data';
import { MealPlan, PantryItem, Recipe, Scan, User } from '@/types';
import { clone } from './apiSimulation';

/**
 * In-memory "database" for the parts of the mock backend that have not been
 * moved to Supabase yet. Seeded once from data/ fixtures and mutated by the
 * service layer for the lifetime of the app session. Nothing outside
 * services/ should import this directly.
 *
 * Live users of this (as of the grocery migration): `scans` only, via
 * scanService.getScanHistory / confirmScan's history append. `user`,
 * `pantry`, `recipes`, and `mealPlan` are legacy seed data no service reads
 * anymore - left in place (like data/mockRecipes.ts) rather than removed,
 * since deleting them only adds risk. Grocery has been fully removed.
 */
interface MockDbState {
  user: User;
  pantry: PantryItem[];
  recipes: Recipe[];
  mealPlan: MealPlan;
  scans: Scan[];
}

export const db: MockDbState = {
  user: clone(MOCK_USER),
  pantry: clone(MOCK_PANTRY),
  recipes: clone(MOCK_RECIPES),
  mealPlan: clone(MOCK_MEAL_PLAN),
  scans: clone(MOCK_SCAN_HISTORY),
};
