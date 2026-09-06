import { fetchKitchenImpactSummary } from '@/lib/supabase/repositories';
import { ImpactPeriod, KitchenImpact } from '@/types';
import { resolveImpactRange } from '@/utils/impactRange';
import { requireUserId } from './requireUserId';

export interface GetKitchenImpactParams {
  /** Defaults to 'month'. */
  period?: ImpactPeriod;
  /** IANA zone the range is resolved in; defaults to 'UTC' (documented fallback). */
  timeZone?: string;
}

/**
 * Kitchen Impact, derived from the real pantry event ledger via the
 * `get_kitchen_impact_summary` RPC. No mock, no mock fallback: an
 * unauthenticated caller throws before any query, and a Supabase failure
 * propagates unchanged. The service does NO aggregation of its own - it only
 * resolves the requested period to a local date range and attaches labels -
 * so it cannot introduce any double-counting the RPC didn't.
 */
async function getKitchenImpact(params: GetKitchenImpactParams = {}): Promise<KitchenImpact> {
  await requireUserId();

  const period: ImpactPeriod = params.period ?? 'month';
  const timeZone = params.timeZone ?? 'UTC';
  const { startDate, endDate, label } = resolveImpactRange(period, new Date(), timeZone);

  const summary = await fetchKitchenImpactSummary({ startDate, endDate, timeZone });

  return {
    ...summary,
    period,
    rangeLabel: label,
    startDate,
    endDate,
    timezone: timeZone,
  };
}

export const impactService = {
  getKitchenImpact,
};
