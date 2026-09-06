import { ImpactUnitTotal, KitchenImpactSummary } from '@/types';
import { supabase } from '../client';

export interface FetchKitchenImpactArgs {
  /** Local calendar date, inclusive; null for unbounded. */
  startDate: string | null;
  /** Local calendar date, inclusive; null for unbounded. */
  endDate: string | null;
  /** IANA zone name; the RPC falls back to UTC if it isn't recognized. */
  timeZone: string;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function mapUnitTotals(value: unknown): ImpactUnitTotal[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => ({
    unit: String((row as Record<string, unknown>).unit ?? 'unknown'),
    totalQuantity: toNumber((row as Record<string, unknown>).totalQuantity),
    eventCount: toNumber((row as Record<string, unknown>).eventCount),
  }));
}

function mapSummary(data: Record<string, unknown>): KitchenImpactSummary {
  const rawRate = data.utilizationRate;
  return {
    itemsAddedCount: toNumber(data.itemsAddedCount),
    useEventCount: toNumber(data.useEventCount),
    itemsDiscardedCount: toNumber(data.itemsDiscardedCount),
    cookingSessionsCount: toNumber(data.cookingSessionsCount),
    utilizationRate: rawRate === null || rawRate === undefined ? null : toNumber(rawRate),
    usedQuantitiesByUnit: mapUnitTotals(data.usedQuantitiesByUnit),
    discardedQuantitiesByUnit: mapUnitTotals(data.discardedQuantitiesByUnit),
    hasActivity: Boolean(data.hasActivity),
  };
}

/**
 * Calls the aggregate-only `get_kitchen_impact_summary` RPC. All grouping,
 * counting, and date filtering happens server-side - the client never loads
 * the raw ledger.
 */
export async function fetchKitchenImpactSummary(args: FetchKitchenImpactArgs): Promise<KitchenImpactSummary> {
  const { data, error } = await supabase.rpc('get_kitchen_impact_summary', {
    p_start_date: args.startDate,
    p_end_date: args.endDate,
    p_timezone: args.timeZone,
  });
  if (error) throw error;
  if (data == null || typeof data !== 'object') {
    throw new Error('get_kitchen_impact_summary returned no summary');
  }
  return mapSummary(data as Record<string, unknown>);
}
