import { AuthError } from '@supabase/supabase-js';

/**
 * Supabase auth error `.message` strings are stable enough to match on for
 * the common cases, but are still implementation detail we don't want
 * leaking to users verbatim (and don't want to trust for anything other than
 * display copy).
 */
const KNOWN_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'That email or password is incorrect.',
  'User already registered': 'An account with this email already exists. Try signing in instead.',
  'Email not confirmed': 'Please confirm your email address before signing in.',
  'Password should be at least 6 characters': 'Password must be at least 8 characters.',
  'Email rate limit exceeded': 'Too many attempts. Please wait a moment and try again.',
  'Email link is invalid or has expired': 'This link has expired. Request a new password reset email.',
};

export function toUserSafeAuthMessage(error: unknown): string {
  if (error instanceof AuthError) {
    return KNOWN_MESSAGES[error.message] ?? 'Something went wrong signing you in. Please try again.';
  }
  return 'Something went wrong. Please check your connection and try again.';
}
