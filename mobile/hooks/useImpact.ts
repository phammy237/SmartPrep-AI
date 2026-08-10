import { useQuery } from '@tanstack/react-query';

import { impactService } from '@/services';
import { queryKeys } from './queryKeys';

export function useKitchenImpact() {
  return useQuery({ queryKey: queryKeys.kitchenImpact, queryFn: impactService.getKitchenImpact });
}
