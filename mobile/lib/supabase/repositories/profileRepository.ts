import { CookingConfidence } from '@/types';
import { Database } from '@/types/database.types';
import { supabase } from '../client';

type ProfileRowDb = Database['public']['Tables']['profiles']['Row'];

export interface ProfileRecord {
  id: string;
  email: string;
  displayName: string;
  authProvider: 'email' | 'apple' | 'google';
  cookingConfidence: CookingConfidence;
  householdSize: number;
  timezone: string;
  createdAt: string;
}

function mapRow(row: ProfileRowDb): ProfileRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    authProvider: row.auth_provider,
    cookingConfidence: row.cooking_confidence as CookingConfidence,
    householdSize: row.household_size,
    timezone: row.timezone,
    createdAt: row.created_at,
  };
}

export async function fetchProfile(userId: string): Promise<ProfileRecord> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return mapRow(data);
}

export interface ProfilePatch {
  displayName?: string;
  cookingConfidence?: CookingConfidence;
  householdSize?: number;
  timezone?: string;
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRecord> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
      ...(patch.cookingConfidence !== undefined ? { cooking_confidence: patch.cookingConfidence } : {}),
      ...(patch.householdSize !== undefined ? { household_size: patch.householdSize } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return mapRow(data);
}
