import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { userService } from '@/services';
import { AuthProvider, UserPreferences } from '@/types';
import { queryKeys } from './queryKeys';

export function useUser() {
  return useQuery({ queryKey: queryKeys.user, queryFn: userService.getUser });
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
    mutationFn: ({ preferences, authProvider }: { preferences: UserPreferences; authProvider: AuthProvider }) =>
      userService.completeOnboarding(preferences, authProvider),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.user }),
  });
}
