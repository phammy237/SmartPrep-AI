export type DietaryPreference =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'halal'
  | 'kosher'
  | 'gluten_free'
  | 'dairy_free'
  | 'none';

export const COOKING_TIME_PREFERENCE_VALUES = ['under_15', '15_30', '30_60', 'no_preference'] as const;
export type CookingTimePreference = (typeof COOKING_TIME_PREFERENCE_VALUES)[number];

/** 1 (beginner) - 5 (experienced) */
export type CookingConfidence = 1 | 2 | 3 | 4 | 5;

export interface SmartPrepPriorities {
  useWhatIHave: number;
  reduceFoodWaste: number;
  saveMoney: number;
  eatHealthier: number;
  cookQuickly: number;
  tryNewFoods: number;
}

export const MACRO_PREFERENCE_VALUES = ['balanced', 'low_carb', 'high_protein'] as const;
export type MacroPreference = (typeof MACRO_PREFERENCE_VALUES)[number];

export interface NutritionGoals {
  dailyCalories: number;
  macroPreference: MacroPreference;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export const WEIGHT_GOAL_DIRECTION_VALUES = ['lose', 'maintain', 'gain'] as const;
export type WeightGoalDirection = (typeof WEIGHT_GOAL_DIRECTION_VALUES)[number];

export interface WeightGoal {
  direction: WeightGoalDirection;
  targetLbs: number;
  /** ISO date. */
  targetDate: string;
}

export interface UserPreferences {
  dietary: DietaryPreference[];
  allergies: string[];
  favoriteCuisines: string[];
  dislikedFoods: string[];
  cookingTime: CookingTimePreference;
  cookingConfidence: CookingConfidence;
  priorities: SmartPrepPriorities;
  nutritionGoals: NutritionGoals;
  weightGoal: WeightGoal;
  weeklyGroceryBudget: number;
}

export const AUTH_PROVIDER_VALUES = ['apple', 'google', 'email'] as const;
/** A concrete auth provider as stored on `profiles.auth_provider` (never null at the DB). */
export type AuthProviderName = (typeof AUTH_PROVIDER_VALUES)[number];
export type AuthProvider = AuthProviderName | null;

export interface User {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  authProvider: AuthProvider;
  /** IANA timezone (e.g. "America/New_York"), defaults to 'UTC' server-side. Used for timezone-aware pantry expiration math. */
  timezone: string;
  preferences: UserPreferences;
  createdAt: string;
}
