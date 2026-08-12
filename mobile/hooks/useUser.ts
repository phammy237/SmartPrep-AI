import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/supabase/AuthProvider';
import { NewPasswordInput, RequestPasswordResetInput, SignInInput, SignUpInput } from '@/lib/validation/authSchemas';
import { authService, userService } from '@/services';
import { UserPreferences } from '@/types';
import { queryKeys } from './queryKeys';

export function useUser() {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: userService.getUser,
    enabled: status === 'signedIn',
  });
}

export function useHasCompletedProfileSetup() {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.profileSetupStatus,
    queryFn: userService.hasCompletedProfileSetup,
    enabled: status === 'signedIn',
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserPreferences>) => userService.updatePreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.user }),
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: UserPreferences) => userService.completeOnboarding(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
      queryClient.invalidateQueries({ queryKey: queryKeys.profileSetupStatus });
    },
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: SignUpInput) => authService.signUp(input),
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) => authService.signIn(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.user }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authService.signOut(),
    onSuccess: () => queryClient.clear(),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: RequestPasswordResetInput) => authService.requestPasswordReset(input),
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (input: NewPasswordInput) => authService.updatePassword(input),
  });
}
