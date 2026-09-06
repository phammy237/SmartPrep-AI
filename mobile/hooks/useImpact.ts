import { useQuery } from '@tanstack/react-query';

import { impactService } from '@/services';
import { ImpactPeriod } from '@/types';
import { queryKeys } from './queryKeys';
import { useUser } from './useUser';

/**
 * Kitchen Impact for the given period. Timezone comes from the signed-in
 * user's profile (falling back to UTC until it loads); the query waits for
 * the user so the range is resolved in the right zone from the first fetch.
 */
export function useKitchenImpact(period: ImpactPeriod = 'month') {
  const userQuery = useUser();
  const timeZone = userQuery.data?.timezone ?? 'UTC';
  return useQuery({
    queryKey: queryKeys.kitchenImpact(period, timeZone),
    queryFn: () => impactService.getKitchenImpact({ period, timeZone }),
    enabled: userQuery.isSuccess,
  });
}
