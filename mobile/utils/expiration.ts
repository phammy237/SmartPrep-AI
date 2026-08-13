import { ExpirationConfidence, FreshnessLabel, IngredientCategory, UserProvidedDateType } from '@/types';

/**
 * Generic per-category shelf-life estimate used only when there's no
 * user-provided package date - a transparent starting point, not a
 * lab-tested prediction. Days counted from the purchase date.
 */
export const CATEGORY_SHELF_LIFE_DAYS: Record<IngredientCategory, number> = {
  produce: 7,
  protein: 4,
  dairy: 10,
  pantry: 180,
  frozen: 90,
  other: 14,
};

export const EXPIRATION_CONFIDENCE_META: Record<ExpirationConfidence, { label: string; description: string }> = {
  high: { label: 'From package date', description: 'Based on the date you entered from the package.' },
  medium: { label: 'Estimated', description: 'A general estimate based on food type - not a guarantee.' },
  low: { label: 'Rough estimate', description: 'A rough guess with limited information available.' },
  unknown: { label: 'No estimate', description: "We don't have enough information to estimate this yet." },
};

/** ISO date (YYYY-MM-DD) arithmetic done in UTC so it's unaffected by the caller's local time-of-day/DST. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface ExpirationEstimateInput {
  category: IngredientCategory;
  purchaseDate?: string;
  userProvidedDate?: string;
  userProvidedDateType?: UserProvidedDateType;
}

export interface ExpirationEstimate {
  estimatedExpirationDate?: string;
  confidence: ExpirationConfidence;
}

/**
 * A user-provided printed date always wins (confidence 'high') since it's
 * real data, not a guess - never overridden by the category heuristic even
 * if a purchase date is also present. With no dates at all, we never
 * fabricate one: confidence 'unknown' and no date.
 */
export function estimateExpiration(input: ExpirationEstimateInput): ExpirationEstimate {
  if (input.userProvidedDate) {
    return { estimatedExpirationDate: input.userProvidedDate, confidence: 'high' };
  }
  if (input.purchaseDate) {
    const days = CATEGORY_SHELF_LIFE_DAYS[input.category];
    return { estimatedExpirationDate: addDaysToIsoDate(input.purchaseDate, days), confidence: 'medium' };
  }
  return { confidence: 'unknown' };
}

const DEFAULT_TIMEZONE = 'UTC';

/**
 * "Today" as YYYY-MM-DD in the given IANA timezone (e.g. the user's stored
 * profile.timezone). Falls back to UTC if no timezone is available or the
 * value isn't a recognized IANA zone - documented fallback, not a silent
 * guess at the device's local zone, so behavior stays consistent regardless
 * of which device the user is on.
 */
export function todayIsoDateInTimeZone(timeZone: string | undefined, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the ISO date shape we store.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

/** Whole days from `a` to `b` (b - a), as pure calendar-date math with no time-of-day involved. */
export function daysBetweenIsoDates(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((bUtc - aUtc) / (1000 * 60 * 60 * 24));
}

export interface ExpirationUrgency {
  label: FreshnessLabel;
  message: string;
}

/** Days-until-estimated-expiration boundaries. At or before 2 days out (or already past) = prioritize; 3-5 days = use soon; beyond that = fresh. */
const PRIORITIZE_WITHIN_DAYS = 2;
const USE_SOON_WITHIN_DAYS = 5;

/**
 * Deterministic, timezone-aware mapping from a date + confidence to the
 * FreshnessLabel vocabulary the rest of the UI already renders (FreshnessTag,
 * PantryItemRow, filters) - so this fully real signal is displayed through
 * the exact same components as before, no UI changes required. Never
 * asserts urgency it isn't confident about: unknown confidence (or a
 * missing date) always renders as "Can't Tell," matching the freshness
 * model's existing rule of never guessing past the data available.
 */
export function deriveExpirationUrgency(
  estimatedExpirationDate: string | undefined,
  confidence: ExpirationConfidence,
  timeZone: string | undefined,
  now: Date = new Date(),
): ExpirationUrgency {
  if (!estimatedExpirationDate || confidence === 'unknown') {
    return { label: 'cant_tell', message: "We don't have a date for this item yet." };
  }

  const today = todayIsoDateInTimeZone(timeZone, now);
  const daysUntil = daysBetweenIsoDates(today, estimatedExpirationDate);
  const prefix = confidence === 'high' ? 'Best by' : 'Estimated around';

  if (daysUntil < 0) {
    return { label: 'prioritize', message: `${prefix} ${estimatedExpirationDate} - use this first.` };
  }
  if (daysUntil <= PRIORITIZE_WITHIN_DAYS) {
    return { label: 'prioritize', message: `${prefix} ${estimatedExpirationDate} - use soon.` };
  }
  if (daysUntil <= USE_SOON_WITHIN_DAYS) {
    return { label: 'use_soon', message: `${prefix} ${estimatedExpirationDate}.` };
  }
  return { label: 'fresh', message: `${prefix} ${estimatedExpirationDate}.` };
}
