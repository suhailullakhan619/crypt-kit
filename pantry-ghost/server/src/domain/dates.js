/**
 * Calendar-day helpers. Pantry Ghost reasons about whole days in UTC (crypt.config reports.timeZone).
 * All pure: `now` is always passed in.
 */
export const DAY = 86400000;

/** Midnight UTC of the day containing `d`. */
export function startOfDay(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

/** Whole calendar days from `a` to `b` (negative when b is before a). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

/** `d` + n days (keeps the time of day). */
export function addDays(d, n) {
  return new Date(new Date(d).getTime() + n * DAY);
}

/** UTC date or null when the triple is not a real calendar date (e.g. 29 Feb 2027). */
export function utcDate(year, monthIndex, day) {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === monthIndex && d.getUTCDate() === day ? d : null;
}

/**
 * Parses 'YYYY-MM' into the UTC month window [start, end).
 * @returns {{ start: Date, end: Date, label: string } | null}
 */
export function monthWindow(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month ?? ''));
  if (!m) return null;
  const year = Number(m[1]);
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11 || year < 2000 || year > 2100) return null;
  const start = new Date(Date.UTC(year, mi, 1));
  const end = new Date(Date.UTC(year, mi + 1, 1));
  const label = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start);
  return { start, end, label };
}

/** 'YYYY-MM' for the month containing `now` (UTC). */
export function monthKey(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "Fri 7 Nov" style label used in spoken answers. */
export function shortDate(d) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d));
}

/** "3 March 2027" */
export function longDate(d) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));
}
