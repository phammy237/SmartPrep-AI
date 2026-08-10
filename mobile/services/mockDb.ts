import {
  MOCK_GROCERY_LIST,
  MOCK_MEAL_PLAN,
  MOCK_PANTRY,
  MOCK_RECIPES,
  MOCK_SCAN_HISTORY,
  MOCK_USER,
} from '@/data';
import { GroceryList, MealPlan, PantryItem, Recipe, Scan, User } from '@/types';
import { clone } from './apiSimulation';

/**
 * In-memory "database" for the mock backend. Seeded once from data/
 * fixtures and mutated by the service layer for the lifetime of the app
 * session - this is what lets confirming a scan actually update the
 * pantry that Home/Pantry screens read from. Nothing outside services/
 * should import this directly.
 */
interface MockDbState {
  user: User;
  pantry: PantryItem[];
  recipes: Recipe[];
  mealPlan: MealPlan;
  groceryList: GroceryList;
  scans: Scan[];
}

export const db: MockDbState = {
  user: clone(MOCK_USER),
  pantry: clone(MOCK_PANTRY),
  recipes: clone(MOCK_RECIPES),
  mealPlan: clone(MOCK_MEAL_PLAN),
  groceryList: clone(MOCK_GROCERY_LIST),
  scans: clone(MOCK_SCAN_HISTORY),
};
