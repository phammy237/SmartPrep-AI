import { User } from '@/types';

export const MOCK_USER: User = {
  id: 'user-1',
  name: 'Alex Rivera',
  email: 'alex.rivera@smartprep.app',
  avatarInitials: 'AR',
  authProvider: 'apple',
  timezone: 'America/New_York',
  createdAt: '2026-06-15T09:00:00.000Z',
  preferences: {
    dietary: ['none'],
    allergies: ['Peanuts'],
    favoriteCuisines: ['Italian', 'Mexican', 'Thai', 'Mediterranean'],
    dislikedFoods: ['Mushrooms', 'Olives'],
    cookingTime: '15_30',
    cookingConfidence: 3,
    priorities: {
      useWhatIHave: 85,
      reduceFoodWaste: 90,
      saveMoney: 60,
      eatHealthier: 55,
      cookQuickly: 50,
      tryNewFoods: 35,
    },
    nutritionGoals: {
      dailyCalories: 1800,
      macroPreference: 'balanced',
      proteinG: 150,
      carbsG: 220,
      fatG: 60,
      fiberG: 28,
    },
    weightGoal: {
      direction: 'lose',
      targetLbs: 10,
      targetDate: '2026-09-30',
    },
    weeklyGroceryBudget: 60,
  },
};
