import { supabase } from '@/lib/supabase/client';
import {
  DietaryPreferencesRecord,
  fetchCurrentNutritionGoals,
  fetchDietaryPreferences,
  fetchProfile,
  NutritionGoalsRecord,
  ProfileRecord,
  replaceNutritionGoals,
  updateProfile,
  upsertDietaryPreferences,
} from '@/lib/supabase/repositories';
import { User, UserPreferences } from '@/types';
import { computeMacroGoals, daysFromToday } from '@/utils/nutrition';
import { initialsFromName } from '@/utils/user';

const DEFAULT_DIETARY: DietaryPreferencesRecord = {
  dietary: [],
  allergies: [],
  favoriteCuisines: [],
  dislikedFoods: [],
  cookingTime: 'no_preference',
  priorities: {
    useWhatIHave: 50,
    reduceFoodWaste: 50,
    saveMoney: 50,
    eatHealthier: 50,
    cookQuickly: 50,
    tryNewFoods: 50,
  },
  weeklyGroceryBudget: 75,
};

function defaultNutritionGoals(): NutritionGoalsRecord {
  return {
    nutritionGoals: { dailyCalories: 2000, macroPreference: 'balanced', ...computeMacroGoals(2000, 'balanced') },
    weightGoal: { direction: 'maintain', targetLbs: 0, targetDate: daysFromToday(60) },
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not signed in');
  }
  return data.user.id;
}

function toUser(profile: ProfileRecord, dietary: DietaryPreferencesRecord, goals: NutritionGoalsRecord): User {
  return {
    id: profile.id,
    name: profile.displayName,
    email: profile.email,
    avatarInitials: initialsFromName(profile.displayName || profile.email),
    authProvider: profile.authProvider,
    createdAt: profile.createdAt,
    preferences: {
      dietary: dietary.dietary,
      allergies: dietary.allergies,
      favoriteCuisines: dietary.favoriteCuisines,
      dislikedFoods: dietary.dislikedFoods,
      cookingTime: dietary.cookingTime,
      cookingConfidence: profile.cookingConfidence,
      priorities: dietary.priorities,
      nutritionGoals: goals.nutritionGoals,
      weightGoal: goals.weightGoal,
      weeklyGroceryBudget: dietary.weeklyGroceryBudget,
    },
  };
}

async function getUser(): Promise<User> {
  const userId = await requireUserId();
  const [profile, dietary, goals] = await Promise.all([
    fetchProfile(userId),
    fetchDietaryPreferences(userId),
    fetchCurrentNutritionGoals(userId),
  ]);
  return toUser(profile, dietary ?? DEFAULT_DIETARY, goals ?? defaultNutritionGoals());
}

/** True once the user has both a dietary_preferences and a nutrition_goals row - i.e. finished onboarding at least once. */
async function hasCompletedProfileSetup(): Promise<boolean> {
  const userId = await requireUserId();
  const [dietary, goals] = await Promise.all([fetchDietaryPreferences(userId), fetchCurrentNutritionGoals(userId)]);
  return Boolean(dietary && goals);
}

const DIETARY_PATCH_KEYS = [
  'dietary',
  'allergies',
  'favoriteCuisines',
  'dislikedFoods',
  'cookingTime',
  'priorities',
  'weeklyGroceryBudget',
] as const satisfies readonly (keyof UserPreferences)[];

async function updatePreferences(patch: Partial<UserPreferences>): Promise<User> {
  const userId = await requireUserId();

  const touchesDietary = DIETARY_PATCH_KEYS.some((key) => key in patch);
  const touchesCookingConfidence = 'cookingConfidence' in patch;
  const touchesGoals = 'nutritionGoals' in patch || 'weightGoal' in patch;

  const [currentDietary, currentGoals] = await Promise.all([
    touchesDietary ? fetchDietaryPreferences(userId) : Promise.resolve(null),
    touchesGoals ? fetchCurrentNutritionGoals(userId) : Promise.resolve(null),
  ]);

  const writes: Promise<unknown>[] = [];

  if (touchesDietary) {
    const base = currentDietary ?? DEFAULT_DIETARY;
    writes.push(
      upsertDietaryPreferences(userId, {
        dietary: patch.dietary ?? base.dietary,
        allergies: patch.allergies ?? base.allergies,
        favoriteCuisines: patch.favoriteCuisines ?? base.favoriteCuisines,
        dislikedFoods: patch.dislikedFoods ?? base.dislikedFoods,
        cookingTime: patch.cookingTime ?? base.cookingTime,
        priorities: patch.priorities ?? base.priorities,
        weeklyGroceryBudget: patch.weeklyGroceryBudget ?? base.weeklyGroceryBudget,
      }),
    );
  }

  if (touchesCookingConfidence && patch.cookingConfidence !== undefined) {
    writes.push(updateProfile(userId, { cookingConfidence: patch.cookingConfidence }));
  }

  if (touchesGoals) {
    const base = currentGoals ?? defaultNutritionGoals();
    writes.push(
      replaceNutritionGoals({
        nutritionGoals: patch.nutritionGoals ?? base.nutritionGoals,
        weightGoal: patch.weightGoal ?? base.weightGoal,
      }),
    );
  }

  await Promise.all(writes);
  return getUser();
}

async function completeOnboarding(preferences: UserPreferences): Promise<User> {
  const userId = await requireUserId();
  await Promise.all([
    upsertDietaryPreferences(userId, {
      dietary: preferences.dietary,
      allergies: preferences.allergies,
      favoriteCuisines: preferences.favoriteCuisines,
      dislikedFoods: preferences.dislikedFoods,
      cookingTime: preferences.cookingTime,
      priorities: preferences.priorities,
      weeklyGroceryBudget: preferences.weeklyGroceryBudget,
    }),
    updateProfile(userId, { cookingConfidence: preferences.cookingConfidence }),
    replaceNutritionGoals({ nutritionGoals: preferences.nutritionGoals, weightGoal: preferences.weightGoal }),
  ]);
  return getUser();
}

export const userService = {
  getUser,
  hasCompletedProfileSetup,
  updatePreferences,
  completeOnboarding,
};
