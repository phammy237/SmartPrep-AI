import { CookingTimePreference, DietaryPreference, SmartPrepPriorities } from '@/types';
import { Database, Json } from '@/types/database.types';
import { supabase } from '../client';

type DietaryPreferencesRowDb = Database['public']['Tables']['dietary_preferences']['Row'];

export interface DietaryPreferencesRecord {
  dietary: DietaryPreference[];
  allergies: string[];
  favoriteCuisines: string[];
  dislikedFoods: string[];
  cookingTime: CookingTimePreference;
  priorities: SmartPrepPriorities;
  weeklyGroceryBudget: number;
}

const DEFAULT_PRIORITIES: SmartPrepPriorities = {
  useWhatIHave: 50,
  reduceFoodWaste: 50,
  saveMoney: 50,
  eatHealthier: 50,
  cookQuickly: 50,
  tryNewFoods: 50,
};

function isSmartPrepPriorities(value: unknown): value is SmartPrepPriorities {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(DEFAULT_PRIORITIES).every((key) => typeof (value as Record<string, unknown>)[key] === 'number');
}

function mapRow(row: DietaryPreferencesRowDb): DietaryPreferencesRecord {
  return {
    dietary: row.dietary_patterns as DietaryPreference[],
    allergies: row.allergens,
    favoriteCuisines: row.preferred_cuisines,
    dislikedFoods: row.excluded_ingredients,
    cookingTime: row.max_cook_time,
    priorities: isSmartPrepPriorities(row.priorities) ? row.priorities : DEFAULT_PRIORITIES,
    weeklyGroceryBudget: row.weekly_grocery_budget ?? 75,
  };
}

export async function fetchDietaryPreferences(userId: string): Promise<DietaryPreferencesRecord | null> {
  const { data, error } = await supabase.from('dietary_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/**
 * dietary_preferences is a single row per user (user_id is the primary key),
 * so a "patch" always means: take the caller's already-merged view of the
 * preferences and upsert the whole row - there's no separate insert path to
 * fall out of sync with update.
 */
export async function upsertDietaryPreferences(
  userId: string,
  values: DietaryPreferencesRecord,
): Promise<DietaryPreferencesRecord> {
  const { data, error } = await supabase
    .from('dietary_preferences')
    .upsert({
      user_id: userId,
      dietary_patterns: values.dietary,
      allergens: values.allergies,
      preferred_cuisines: values.favoriteCuisines,
      excluded_ingredients: values.dislikedFoods,
      max_cook_time: values.cookingTime,
      // SmartPrepPriorities has fixed named keys, so it isn't structurally a
      // Json index signature even though every value in it is - it's a
      // jsonb column, this is a serialization-boundary cast, not a type escape.
      priorities: values.priorities as unknown as Json,
      weekly_grocery_budget: values.weeklyGroceryBudget,
    })
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}
