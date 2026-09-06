import { resolveImpactRange } from '../impactRange';

describe('resolveImpactRange', () => {
  it('all-time is an unbounded range', () => {
    expect(resolveImpactRange('all', new Date('2026-09-15T12:00:00Z'), 'UTC')).toEqual({
      startDate: null,
      endDate: null,
      label: 'All time',
    });
  });

  it('today is a single local day', () => {
    expect(resolveImpactRange('today', new Date('2026-09-15T12:00:00Z'), 'UTC')).toEqual({
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      label: 'Today',
    });
  });

  it('week is the Monday-Sunday week containing the local date', () => {
    // 2026-09-09 is a Wednesday -> Mon 2026-09-07 .. Sun 2026-09-13
    expect(resolveImpactRange('week', new Date('2026-09-09T12:00:00Z'), 'UTC')).toEqual({
      startDate: '2026-09-07',
      endDate: '2026-09-13',
      label: 'This week',
    });
  });

  it('month is the real calendar month (incl. short months)', () => {
    expect(resolveImpactRange('month', new Date('2026-09-15T12:00:00Z'), 'UTC')).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    expect(resolveImpactRange('month', new Date('2026-02-10T12:00:00Z'), 'UTC')).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
  });

  it('resolves the range in the given timezone - a near-midnight UTC instant lands in different months', () => {
    const instant = new Date('2026-09-01T02:00:00Z');
    // America/New_York is UTC-4 in September -> 2026-08-31 22:00 local -> August
    expect(resolveImpactRange('month', instant, 'America/New_York')).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    // Asia/Tokyo is UTC+9 -> 2026-09-01 11:00 local -> September
    expect(resolveImpactRange('month', instant, 'Asia/Tokyo')).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });
});
