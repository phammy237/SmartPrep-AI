export type DietaryPreference =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'halal'
  | 'kosher'
  | 'gluten_free'
  | 'dairy_free'
  | 'none';

export type CookingTimePreference = 'under_15' | '15_30' | '30_60' | 'no_preference';

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

export type MacroPreference = 'balanced' | 'low_carb' | 'high_protein';

export interface NutritionGoals {
  dailyCalories: number;
  macroPreference: MacroPreference;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export type WeightGoalDirection = 'lose' | 'maintain' | 'gain';

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

export type AuthProvider = 'apple' | 'google' | 'email' | null;

export interface User {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  authProvider: AuthProvider;
  preferences: UserPreferences;
  createdAt: string;
}
