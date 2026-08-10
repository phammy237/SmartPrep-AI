import { AuthProvider, User, UserPreferences } from '@/types';
import { clone, delay } from './apiSimulation';
import { db } from './mockDb';

async function getUser(): Promise<User> {
  await delay(300);
  return clone(db.user);
}

async function updatePreferences(patch: Partial<UserPreferences>): Promise<User> {
  await delay(300);
  db.user.preferences = { ...db.user.preferences, ...patch };
  return clone(db.user);
}

async function completeOnboarding(preferences: UserPreferences, authProvider: AuthProvider): Promise<User> {
  await delay(500);
  db.user.preferences = preferences;
  db.user.authProvider = authProvider;
  return clone(db.user);
}

export const userService = {
  getUser,
  updatePreferences,
  completeOnboarding,
};
