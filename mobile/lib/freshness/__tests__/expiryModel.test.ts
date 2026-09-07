import { EXPIRY_THRESHOLDS, assessExpiry, expiryStateRank, isUrgentExpiryState } from '../expiryModel';

// Fixed clock: "today" is 2026-06-10 in UTC.
const NOW = new Date('2026-06-10T12:00:00Z');

function assess(date: string | undefined, confidence: Parameters<typeof assessExpiry>[0]['expirationConfidence'], tz?: string, now = NOW) {
  return assessExpiry({ estimatedExpirationDate: date, expirationConfidence: confidence, timeZone: tz, now });
}

describe('assessExpiry - state boundaries (calendar days)', () => {
  it('no date -> unknown, days null', () => {
    const a = assess(undefined, undefined);
    expect(a).toMatchObject({ state: 'unknown', daysUntilExpiry: null });
    expect(a.phrase).toBe('No tracked date');
  });

  it("confidence 'unknown' -> unknown even with a date (never claim urgency from a fabricated date)", () => {
    expect(assess('2026-06-11', 'unknown').state).toBe('unknown');
  });

  it('date before today -> expired', () => {
    const a = assess('2026-06-09', 'high');
    expect(a).toMatchObject({ state: 'expired', daysUntilExpiry: -1 });
  });

  it('expires today -> critical', () => {
    expect(assess('2026-06-10', 'high')).toMatchObject({ state: 'critical', daysUntilExpiry: 0 });
  });

  it('expires tomorrow -> critical (CRITICAL_WITHIN_DAYS = 1)', () => {
    expect(EXPIRY_THRESHOLDS.CRITICAL_WITHIN_DAYS).toBe(1);
    expect(assess('2026-06-11', 'high')).toMatchObject({ state: 'critical', daysUntilExpiry: 1 });
  });

  it('day after the critical window -> use_soon', () => {
    expect(assess('2026-06-12', 'high')).toMatchObject({ state: 'use_soon', daysUntilExpiry: 2 });
  });

  it('use_soon upper boundary (USE_SOON_WITHIN_DAYS) is inclusive; one past is fresh', () => {
    expect(EXPIRY_THRESHOLDS.USE_SOON_WITHIN_DAYS).toBe(4);
    expect(assess('2026-06-14', 'high').state).toBe('use_soon'); // +4
    expect(assess('2026-06-15', 'high').state).toBe('fresh'); // +5
  });

  it('a known date well in the future -> fresh', () => {
    expect(assess('2026-07-20', 'high').state).toBe('fresh');
  });
});

describe('assessExpiry - confidence-aware phrasing', () => {
  it("user-confirmed ('high') is phrased as fact", () => {
    expect(assess('2026-06-11', 'high').phrase).toBe('Expires tomorrow');
    expect(assess('2026-06-10', 'high').phrase).toBe('Expires today');
    expect(assess('2026-06-13', 'high').phrase).toBe('Best used within 3 days');
    expect(assess('2026-06-09', 'high').phrase).toBe('Past its date — check before using');
    expect(assess('2026-06-11', 'high').isUserConfirmedDate).toBe(true);
    expect(assess('2026-06-11', 'high').isEstimatedDate).toBe(false);
  });

  it("estimated ('medium'/'low') is phrased tentatively and never as a safety verdict", () => {
    expect(assess('2026-06-11', 'medium').phrase).toBe('Estimated to expire tomorrow');
    expect(assess('2026-06-13', 'medium').phrase).toBe('Estimated best used within 3 days');
    expect(assess('2026-06-09', 'low').phrase).toBe('Past its estimated date — check before using');
    expect(assess('2026-06-11', 'medium').isEstimatedDate).toBe(true);
    expect(assess('2026-06-11', 'medium').isUserConfirmedDate).toBe(false);
  });

  it('"expired" phrasing is always "check before using", never "throw away"', () => {
    expect(assess('2026-05-01', 'high').phrase).not.toMatch(/throw|discard|unsafe/i);
    expect(assess('2026-05-01', 'medium').phrase).not.toMatch(/throw|discard|unsafe/i);
  });
});

describe('assessExpiry - timezone date boundary', () => {
  it('resolves "today" in the given zone, not UTC', () => {
    // 2026-06-10 23:30 UTC. New York (UTC-4 in June) local = 2026-06-10 19:30.
    const nyNow = new Date('2026-06-10T23:30:00Z');
    expect(assess('2026-06-11', 'high', 'America/New_York', nyNow)).toMatchObject({
      state: 'critical',
      daysUntilExpiry: 1,
    });
    // Same instant, Tokyo (UTC+9) local = 2026-06-11 08:30 -> "today" is the 11th.
    expect(assess('2026-06-11', 'high', 'Asia/Tokyo', nyNow)).toMatchObject({
      state: 'critical',
      daysUntilExpiry: 0,
    });
  });

  it('falls back to UTC for an unknown zone (documented, not a device guess)', () => {
    expect(assess('2026-06-11', 'high', 'Not/AZone').daysUntilExpiry).toBe(1);
  });
});

describe('expiryStateRank / isUrgentExpiryState', () => {
  it('ranks most-urgent first for FEFO', () => {
    expect(expiryStateRank('expired')).toBeLessThan(expiryStateRank('critical'));
    expect(expiryStateRank('critical')).toBeLessThan(expiryStateRank('use_soon'));
    expect(expiryStateRank('use_soon')).toBeLessThan(expiryStateRank('fresh'));
  });

  it('urgent = expired | critical | use_soon', () => {
    expect(['expired', 'critical', 'use_soon'].every(isUrgentExpiryState as (s: string) => boolean)).toBe(true);
    expect(isUrgentExpiryState('fresh')).toBe(false);
    expect(isUrgentExpiryState('unknown')).toBe(false);
  });
});
