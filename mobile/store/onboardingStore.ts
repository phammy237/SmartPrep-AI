import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  CookingConfidence,
  CookingTimePreference,
  DietaryPreference,
  MacroPreference,
  SmartPrepPriorities,
  UserPreferences,
  WeightGoalDirection,
} from '@/types';
import { computeMacroGoals, daysFromToday } from '@/utils/nutrition';

type ListField = 'allergies' | 'favoriteCuisines' | 'dislikedFoods';

interface OnboardingDraft {
  dietary: DietaryPreference[];
  allergies: string[];
  favoriteCuisines: string[];
  dislikedFoods: string[];
  cookingTime: CookingTimePreference;
  cookingConfidence: CookingConfidence;
  priorities: SmartPrepPriorities;
  weightGoalDirection: WeightGoalDirection;
  weightGoalTargetLbs: number;
  weightGoalTargetDate: string;
  dailyCalories: number;
  macroPreference: MacroPreference;
  weeklyGroceryBudget: number;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  dietary: [],
  allergies: [],
  favoriteCuisines: [],
  dislikedFoods: [],
  cookingTime: 'no_preference',
  cookingConfidence: 3,
  priorities: {
    useWhatIHave: 50,
    reduceFoodWaste: 50,
    saveMoney: 50,
    eatHealthier: 50,
    cookQuickly: 50,
    tryNewFoods: 50,
  },
  weightGoalDirection: 'maintain',
  weightGoalTargetLbs: 0,
  weightGoalTargetDate: daysFromToday(60),
  dailyCalories: 2000,
  macroPreference: 'balanced',
  weeklyGroceryBudget: 75,
};

interface OnboardingState extends OnboardingDraft {
  toggleDietary: (value: DietaryPreference) => void;
  toggleListValue: (field: ListField, value: string) => void;
  setCookingTime: (value: CookingTimePreference) => void;
  setCookingConfidence: (value: CookingConfidence) => void;
  setPriority: (key: keyof SmartPrepPriorities, value: number) => void;
  setWeightGoalDirection: (value: WeightGoalDirection) => void;
  setWeightGoalTargetLbs: (value: number) => void;
  setWeightGoalTargetDate: (value: string) => void;
  setDailyCalories: (value: number) => void;
  setMacroPreference: (value: MacroPreference) => void;
  setWeeklyGroceryBudget: (value: number) => void;
  reset: () => void;
  toPreferences: () => UserPreferences;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_DRAFT,

      toggleDietary: (value) =>
        set((state) => {
          if (value === 'none') {
            return { dietary: state.dietary.includes('none') ? [] : ['none'] };
          }
          const withoutNone = state.dietary.filter((d) => d !== 'none');
          const next = withoutNone.includes(value)
            ? withoutNone.filter((d) => d !== value)
            : [...withoutNone, value];
          return { dietary: next };
        }),

      toggleListValue: (field, value) =>
        set((state) => {
          const current = state[field];
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          return { [field]: next } as Partial<OnboardingState>;
        }),

      setCookingTime: (value) => set({ cookingTime: value }),
      setCookingConfidence: (value) => set({ cookingConfidence: value }),

      setPriority: (key, value) =>
        set((state) => ({ priorities: { ...state.priorities, [key]: value } })),

      setWeightGoalDirection: (value) => set({ weightGoalDirection: value }),
      setWeightGoalTargetLbs: (value) => set({ weightGoalTargetLbs: value }),
      setWeightGoalTargetDate: (value) => set({ weightGoalTargetDate: value }),
      setDailyCalories: (value) => set({ dailyCalories: value }),
      setMacroPreference: (value) => set({ macroPreference: value }),
      setWeeklyGroceryBudget: (value) => set({ weeklyGroceryBudget: value }),

      reset: () => set(DEFAULT_DRAFT),

      toPreferences: () => {
        const state = get();
        const macros = computeMacroGoals(state.dailyCalories, state.macroPreference);
        return {
          dietary: state.dietary,
          allergies: state.allergies,
          favoriteCuisines: state.favoriteCuisines,
          dislikedFoods: state.dislikedFoods,
          cookingTime: state.cookingTime,
          cookingConfidence: state.cookingConfidence,
          priorities: state.priorities,
          nutritionGoals: {
            dailyCalories: state.dailyCalories,
            macroPreference: state.macroPreference,
            ...macros,
          },
          weightGoal: {
            direction: state.weightGoalDirection,
            targetLbs: state.weightGoalTargetLbs,
            targetDate: state.weightGoalTargetDate,
          },
          weeklyGroceryBudget: state.weeklyGroceryBudget,
        };
      },
    }),
    {
      name: 'smartprep-onboarding-draft',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
