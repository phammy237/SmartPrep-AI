import { supabase } from '@/lib/supabase/client';

/** Shared by the Phase 3 real services (recipes/planner/cooking/prepared meals/meal logs). */
export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not signed in');
  }
  return data.user.id;
}
