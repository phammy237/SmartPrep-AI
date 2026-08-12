import { toUserSafeAuthMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase/client';
import { NewPasswordInput, RequestPasswordResetInput, SignInInput, SignUpInput } from '@/lib/validation/authSchemas';

async function signUp({ email, password, displayName }: SignUpInput): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(toUserSafeAuthMessage(error));
  // If the Supabase project has "Confirm email" enabled, signUp succeeds but
  // returns no session until the user clicks the confirmation link.
  return { needsEmailConfirmation: !data.session };
}

async function signIn({ email, password }: SignInInput): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(toUserSafeAuthMessage(error));
}

async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(toUserSafeAuthMessage(error));
}

async function requestPasswordReset({ email }: RequestPasswordResetInput): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'smartprep://auth/reset-password',
  });
  if (error) throw new Error(toUserSafeAuthMessage(error));
}

async function updatePassword({ password }: NewPasswordInput): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(toUserSafeAuthMessage(error));
}

export const authService = {
  signUp,
  signIn,
  signOut,
  requestPasswordReset,
  updatePassword,
};
