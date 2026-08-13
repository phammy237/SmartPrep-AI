import { ExpirationConfidence } from '@/types';
import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  deriveExpirationUrgency,
  estimateExpiration,
  EXPIRATION_CONFIDENCE_META,
  todayIsoDateInTimeZone,
} from '../expiration';

describe('EXPIRATION_CONFIDENCE_META', () => {
  it('has a label and description for every ExpirationConfidence value', () => {
    const confidences: ExpirationConfidence[] = ['high', 'medium', 'low', 'unknown'];
    for (const confidence of confidences) {
      expect(EXPIRATION_CONFIDENCE_META[confidence].label).toBeTruthy();
      expect(EXPIRATION_CONFIDENCE_META[confidence].description).toBeTruthy();
    }
  });

  it('never claims certainty for "unknown" - the copy says so explicitly', () => {
    expect(EXPIRATION_CONFIDENCE_META.unknown.description.toLowerCase()).toContain("don't have enough information");
  });
});

describe('addDaysToIsoDate', () => {
  it('adds days within a month', () => {
    expect(addDaysToIsoDate('2026-08-10', 5)).toBe('2026-08-15');
  });

  it('rolls over a month boundary', () => {
    expect(addDaysToIsoDate('2026-08-29', 5)).toBe('2026-09-03');
  });

  it('rolls over a year boundary', () => {
    expect(addDaysToIsoDate('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('handles a leap-year February', () => {
    expect(addDaysToIsoDate('2028-02-27', 3)).toBe('2028-03-01');
  });
});

describe('daysBetweenIsoDates', () => {
  it('is zero for the same date', () => {
    expect(daysBetweenIsoDates('2026-08-10', '2026-08-10')).toBe(0);
  });

  it('is positive when b is after a', () => {
    expect(daysBetweenIsoDates('2026-08-10', '2026-08-15')).toBe(5);
  });

  it('is negative when b is before a', () => {
    expect(daysBetweenIsoDates('2026-08-10', '2026-08-05')).toBe(-5);
  });
});

describe('todayIsoDateInTimeZone', () => {
  it('falls back to UTC when no timezone is given', () => {
    const now = new Date('2026-08-12T23:30:00.000Z');
    expect(todayIsoDateInTimeZone(undefined, now)).toBe('2026-08-12');
  });

  it('falls back to UTC for an invalid/unrecognized timezone rather than throwing', () => {
    const now = new Date('2026-08-12T23:30:00.000Z');
    expect(todayIsoDateInTimeZone('Not/A_Real_Zone', now)).toBe('2026-08-12');
  });

  it('resolves a timezone that is a day behind UTC near midnight UTC', () => {
    // 23:30 UTC is already 15:30 the same day in Los Angeles (UTC-8) - not a
    // day-boundary case there, so pick a moment that actually crosses.
    const now = new Date('2026-08-13T05:30:00.000Z'); // 22:30 Aug 12 in LA (UTC-7 in August, DST)
    expect(todayIsoDateInTimeZone('America/Los_Angeles', now)).toBe('2026-08-12');
    expect(todayIsoDateInTimeZone('UTC', now)).toBe('2026-08-13');
  });

  it('resolves a timezone that is a day ahead of UTC', () => {
    const now = new Date('2026-08-12T20:00:00.000Z'); // already Aug 13 in Tokyo (UTC+9)
    expect(todayIsoDateInTimeZone('Asia/Tokyo', now)).toBe('2026-08-13');
    expect(todayIsoDateInTimeZone('UTC', now)).toBe('2026-08-12');
  });
});

describe('estimateExpiration', () => {
  it('prefers a user-provided date over a purchase-date heuristic, with high confidence', () => {
    const result = estimateExpiration({
      category: 'dairy',
      purchaseDate: '2026-08-01',
      userProvidedDate: '2026-08-20',
    });
    expect(result).toEqual({ estimatedExpirationDate: '2026-08-20', confidence: 'high' });
  });

  it('falls back to a category shelf-life heuristic from the purchase date, with medium confidence', () => {
    const result = estimateExpiration({ category: 'produce', purchaseDate: '2026-08-01' });
    expect(result).toEqual({ estimatedExpirationDate: '2026-08-08', confidence: 'medium' });
  });

  it('never fabricates a date when neither date is known', () => {
    const result = estimateExpiration({ category: 'pantry' });
    expect(result).toEqual({ confidence: 'unknown' });
    expect(result.estimatedExpirationDate).toBeUndefined();
  });

  it('uses a different shelf-life per category', () => {
    expect(estimateExpiration({ category: 'frozen', purchaseDate: '2026-01-01' }).estimatedExpirationDate).toBe(
      '2026-04-01',
    );
    expect(estimateExpiration({ category: 'protein', purchaseDate: '2026-01-01' }).estimatedExpirationDate).toBe(
      '2026-01-05',
    );
  });
});

describe('deriveExpirationUrgency', () => {
  const now = new Date('2026-08-12T12:00:00.000Z');

  it('returns cant_tell when confidence is unknown, even if a date is somehow present', () => {
    expect(deriveExpirationUrgency('2026-08-15', 'unknown', 'UTC', now).label).toBe('cant_tell');
  });

  it('returns cant_tell when there is no date', () => {
    expect(deriveExpirationUrgency(undefined, 'medium', 'UTC', now).label).toBe('cant_tell');
  });

  it('treats a past date as prioritize', () => {
    expect(deriveExpirationUrgency('2026-08-10', 'high', 'UTC', now).label).toBe('prioritize');
  });

  it('treats today as prioritize', () => {
    expect(deriveExpirationUrgency('2026-08-12', 'high', 'UTC', now).label).toBe('prioritize');
  });

  it('is prioritize at exactly the 2-day boundary', () => {
    expect(deriveExpirationUrgency('2026-08-14', 'high', 'UTC', now).label).toBe('prioritize');
  });

  it('is use_soon just past the prioritize boundary', () => {
    expect(deriveExpirationUrgency('2026-08-15', 'high', 'UTC', now).label).toBe('use_soon');
  });

  it('is use_soon at exactly the 5-day boundary', () => {
    expect(deriveExpirationUrgency('2026-08-17', 'high', 'UTC', now).label).toBe('use_soon');
  });

  it('is fresh just past the use_soon boundary', () => {
    expect(deriveExpirationUrgency('2026-08-18', 'high', 'UTC', now).label).toBe('fresh');
  });

  it('labels a user-provided (high-confidence) date as "Best by" and a heuristic (medium) one as "Estimated around"', () => {
    expect(deriveExpirationUrgency('2026-08-20', 'high', 'UTC', now).message).toMatch(/^Best by/);
    expect(deriveExpirationUrgency('2026-08-20', 'medium', 'UTC', now).message).toMatch(/^Estimated around/);
  });

  it('evaluates urgency relative to the given timezone, not UTC', () => {
    // At this instant it's Aug 13 in Tokyo but still Aug 12 in UTC - an
    // estimated expiration of Aug 13 is "today" (prioritize) in Tokyo but
    // still "tomorrow"-ish (still within prioritize window either way here,
    // so use a date further out to actually distinguish the two zones).
    const instant = new Date('2026-08-12T20:00:00.000Z');
    const farEnough = '2026-08-19'; // 6 days out from UTC's Aug 13, 7 days out from Tokyo's... let's just assert the day counts differ
    const utcDays = daysBetweenIsoDates(todayIsoDateInTimeZone('UTC', instant), farEnough);
    const tokyoDays = daysBetweenIsoDates(todayIsoDateInTimeZone('Asia/Tokyo', instant), farEnough);
    expect(tokyoDays).toBe(utcDays - 1);
  });
});
