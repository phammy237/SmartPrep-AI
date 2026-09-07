/**
 * The one freshness/expiry taxonomy for SmartPrep's proactive
 * recommendations. Every "use this soon" judgement in the recommendation
 * engine and its UI comes from here - thresholds are NOT re-declared in
 * screens.
 *
 * States (calendar-day based, timezone-aware):
 *   expired    - tracked date is before today
 *   critical   - expires today or tomorrow
 *   use_soon   - expires within USE_SOON_WITHIN_DAYS
 *   fresh      - a known tracked date beyond the urgency window
 *   unknown    - no trustworthy date (confidence 'unknown', or no date at all)
 *
 * Confidence is respected (see types/pantry.ts `ExpirationConfidence`):
 *   'high'          -> a user-provided printed date. Phrased as fact
 *                     ("Expires tomorrow").
 *   'medium'/'low'  -> a heuristic estimate. Phrased tentatively
 *                     ("Estimated to expire soon").
 *   'unknown'       -> never claim urgency from a fabricated date.
 *
 * "Expired" is never a food-safety verdict - the phrasing is always
 * "check before using", never "throw this away".
 */

import { ExpirationConfidence } from '@/types';
import { daysBetweenIsoDates, todayIsoDateInTimeZone } from '@/utils/expiration';

export type ExpiryState = 'expired' | 'critical' | 'use_soon' | 'fresh' | 'unknown';

/** Calendar-day thresholds. Documented here, imported everywhere else. */
export const EXPIRY_THRESHOLDS = {
  /** expires within this many days of today (0 = today, 1 = tomorrow) -> `critical` */
  CRITICAL_WITHIN_DAYS: 1,
  /** expires within this many days of today -> `use_soon` (when not already `critical`) */
  USE_SOON_WITHIN_DAYS: 4,
} as const;

/** For FEFO ordering and "how urgent" comparisons. Lower = more urgent. */
const STATE_RANK: Record<ExpiryState, number> = {
  expired: 0,
  critical: 1,
  use_soon: 2,
  unknown: 3,
  fresh: 4,
};

export function expiryStateRank(state: ExpiryState): number {
  return STATE_RANK[state];
}

/** `expired`, `critical`, `use_soon` are the states the "Use Soon" feature acts on. */
export function isUrgentExpiryState(state: ExpiryState): boolean {
  return state === 'expired' || state === 'critical' || state === 'use_soon';
}

export interface ExpiryAssessmentInput {
  /** ISO YYYY-MM-DD system estimate (see PantryItem.estimatedExpirationDate). */
  estimatedExpirationDate?: string;
  expirationConfidence?: ExpirationConfidence;
  /** IANA zone the "today" boundary is resolved in. Defaults to UTC (documented). */
  timeZone?: string;
  now?: Date;
}

export interface ExpiryAssessment {
  state: ExpiryState;
  /** Whole calendar days from today to the tracked date; negative = past. `null` when `unknown`. */
  daysUntilExpiry: number | null;
  /** True only when the date is a user-provided printed date (confidence 'high'). */
  isUserConfirmedDate: boolean;
  /** True for a heuristic estimate ('medium' / 'low'). */
  isEstimatedDate: boolean;
  /** The tracked date, echoed back for UI. Undefined when `unknown`. */
  expirationDate?: string;
  /** Short, honest phrase for UI. Never a safety guarantee. */
  phrase: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function phraseFor(state: ExpiryState, days: number, confirmed: boolean): string {
  if (state === 'expired') {
    return confirmed ? 'Past its date — check before using' : 'Past its estimated date — check before using';
  }
  if (state === 'critical') {
    if (confirmed) return days <= 0 ? 'Expires today' : 'Expires tomorrow';
    return days <= 0 ? 'Estimated to expire today' : 'Estimated to expire tomorrow';
  }
  if (state === 'use_soon') {
    return confirmed ? `Best used within ${days} days` : `Estimated best used within ${days} days`;
  }
  return confirmed ? 'Fresh' : 'Estimated fresh';
}

/**
 * Deterministic expiry assessment. Pure apart from `now` defaulting to the
 * current time (pass `now` in tests for stable dates).
 */
export function assessExpiry(input: ExpiryAssessmentInput): ExpiryAssessment {
  const { estimatedExpirationDate, expirationConfidence, timeZone } = input;
  const now = input.now ?? new Date();

  const hasTrustworthyDate =
    typeof estimatedExpirationDate === 'string' &&
    ISO_DATE.test(estimatedExpirationDate) &&
    expirationConfidence !== undefined &&
    expirationConfidence !== 'unknown';

  if (!hasTrustworthyDate) {
    return {
      state: 'unknown',
      daysUntilExpiry: null,
      isUserConfirmedDate: false,
      isEstimatedDate: false,
      phrase: 'No tracked date',
    };
  }

  const confirmed = expirationConfidence === 'high';
  const today = todayIsoDateInTimeZone(timeZone, now);
  const days = daysBetweenIsoDates(today, estimatedExpirationDate as string);

  let state: ExpiryState;
  if (days < 0) state = 'expired';
  else if (days <= EXPIRY_THRESHOLDS.CRITICAL_WITHIN_DAYS) state = 'critical';
  else if (days <= EXPIRY_THRESHOLDS.USE_SOON_WITHIN_DAYS) state = 'use_soon';
  else state = 'fresh';

  return {
    state,
    daysUntilExpiry: days,
    isUserConfirmedDate: confirmed,
    isEstimatedDate: !confirmed,
    expirationDate: estimatedExpirationDate,
    phrase: phraseFor(state, days, confirmed),
  };
}

/** Convenience over a PantryItem-shaped object. */
export function assessPantryItemExpiry(
  item: { estimatedExpirationDate?: string; expirationConfidence?: ExpirationConfidence },
  timeZone?: string,
  now?: Date,
): ExpiryAssessment {
  return assessExpiry({
    estimatedExpirationDate: item.estimatedExpirationDate,
    expirationConfidence: item.expirationConfidence,
    timeZone,
    now,
  });
}
