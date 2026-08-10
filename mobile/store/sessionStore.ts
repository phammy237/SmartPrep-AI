import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SessionState {
  hasOnboarded: boolean;
  /** True once AsyncStorage rehydration has finished - gates the initial route decision. */
  hasHydrated: boolean;
  completeOnboarding: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      hasHydrated: false,
      completeOnboarding: () => set({ hasOnboarded: true }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'smartprep-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ hasOnboarded: state.hasOnboarded }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
