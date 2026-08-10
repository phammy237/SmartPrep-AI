import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  AuthProvider,
  CookingConfidence,
  CookingTimePreference,
  DietaryPreference,
  SmartPrepPriorities,
  UserPreferences,
} from '@/types';

type ListField = 'allergies' | 'favoriteCuisines' | 'dislikedFoods';

interface OnboardingDraft {
  authProvider: AuthProvider;
  dietary: DietaryPreference[];
  allergies: string[];
  favoriteCuisines: string[];
  dislikedFoods: string[];
  cookingTime: CookingTimePreference;
  cookingConfidence: CookingConfidence;
  priorities: SmartPrepPriorities;
}

const DEFAULT_DRAFT: OnboardingDraft = {
  authProvider: null,
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
};

interface OnboardingState extends OnboardingDraft {
  setAuthProvider: (provider: AuthProvider) => void;
  toggleDietary: (value: DietaryPreference) => void;
  toggleListValue: (field: ListField, value: string) => void;
  setCookingTime: (value: CookingTimePreference) => void;
  setCookingConfidence: (value: CookingConfidence) => void;
  setPriority: (key: keyof SmartPrepPriorities, value: number) => void;
  reset: () => void;
  toPreferences: () => UserPreferences;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_DRAFT,

      setAuthProvider: (provider) => set({ authProvider: provider }),

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

      reset: () => set(DEFAULT_DRAFT),

      toPreferences: () => {
        const state = get();
        return {
          dietary: state.dietary,
          allergies: state.allergies,
          favoriteCuisines: state.favoriteCuisines,
          dislikedFoods: state.dislikedFoods,
          cookingTime: state.cookingTime,
          cookingConfidence: state.cookingConfidence,
          priorities: state.priorities,
        };
      },
    }),
    {
      name: 'smartprep-onboarding-draft',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
