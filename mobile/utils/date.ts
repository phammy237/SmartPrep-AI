import { DayOfWeek } from '@/types';

/** `Date#getDay()` is 0 (Sunday) - 6 (Saturday), local time; this remaps that index to our DayOfWeek keys. */
const WEEKDAY_BY_JS_DAY_INDEX: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The device's current local weekday (not UTC) as a DayOfWeek key, for looking up "today" in plan-scoped data. */
export function currentWeekday(now: Date = new Date()): DayOfWeek {
  return WEEKDAY_BY_JS_DAY_INDEX[now.getDay()];
}
