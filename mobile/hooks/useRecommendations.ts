import { useQuery } from '@tanstack/react-query';

import { recommendationService, USE_SOON_DEFAULT_LIMIT } from '@/services';
import { queryKeys } from './queryKeys';
import { useUser } from './useUser';

/**
 * Deterministic "Use Soon" recipe recommendations for Home. Derived from the
 * live pantry + recipe catalog + near-term planner - no stored output, no LLM.
 * Invalidated via the `['recommendations']` prefix whenever pantry / recipes /
 * planner mutate (see the invalidators in usePantry / usePlanner / useCooking).
 */
export function useUseSoonRecommendations(limit: number = USE_SOON_DEFAULT_LIMIT) {
  const userQuery = useUser();
  const timeZone = userQuery.data?.timezone ?? 'UTC';
  return useQuery({
    queryKey: queryKeys.useSoonRecommendations(timeZone, limit),
    queryFn: () => recommendationService.getUseSoonRecommendations({ timeZone, limit }),
  });
}
