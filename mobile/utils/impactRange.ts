import { ImpactPeriod } from '@/types';
import { todayIsoDateInTimeZone } from './expiration';
import { localWeekRange } from './nutritionSnapshot';

export interface ResolvedImpactRange {
  /** Local calendar date (YYYY-MM-DD), inclusive. null = unbounded (all-time). */
  startDate: string | null;
  /** Local calendar date (YYYY-MM-DD), inclusive. null = unbounded (all-time). */
  endDate: string | null;
  label: string;
}

function firstOfMonthIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function lastOfMonthIso(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Turns a period selector into a pair of LOCAL calendar dates (in `timeZone`).
 * The RPC converts these to instants server-side with `AT TIME ZONE`, so all
 * timezone reasoning lives in exactly one place: which local day "now" is.
 *
 * Week is Monday-Sunday, matching `localWeekRange` / "Generate My Week".
 * Month is the real calendar month. `timeZone` falls back to UTC upstream if
 * unset; an unrecognized zone falls back to UTC in the RPC.
 */
export function resolveImpactRange(period: ImpactPeriod, now: Date, timeZone: string): ResolvedImpactRange {
  if (period === 'all') {
    return { startDate: null, endDate: null, label: 'All time' };
  }

  const today = todayIsoDateInTimeZone(timeZone, now);

  if (period === 'today') {
    return { startDate: today, endDate: today, label: 'Today' };
  }

  if (period === 'week') {
    const { weekStart, weekEnd } = localWeekRange(now, timeZone);
    return { startDate: weekStart, endDate: weekEnd, label: 'This week' };
  }

  return { startDate: firstOfMonthIso(today), endDate: lastOfMonthIso(today), label: 'This month' };
}
