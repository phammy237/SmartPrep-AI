import { DAY_ORDER } from '@/features/planner/constants';
import { currentWeekday } from '../date';

describe('currentWeekday', () => {
  it('maps every day of a week to the matching DayOfWeek key, in local time', () => {
    // 2026-08-10T12:00:00 local is a Monday; walking forward one local day at a time keeps this
    // test independent of the machine's timezone (unlike constructing each date from a UTC string).
    const monday = new Date(2026, 7, 10, 12, 0, 0);
    DAY_ORDER.forEach((expected, offset) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + offset);
      expect(currentWeekday(day)).toBe(expected);
    });
  });

  it('does not shift the weekday near local midnight (no UTC off-by-one)', () => {
    // 00:30 local on a Tuesday should still read as Tuesday, even though in many timezones the
    // equivalent UTC instant falls on Monday - getDay() is local, so this must not shift.
    const earlyTuesday = new Date(2026, 7, 11, 0, 30, 0);
    expect(currentWeekday(earlyTuesday)).toBe('tue');
  });
});
