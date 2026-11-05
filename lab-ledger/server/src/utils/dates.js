export const DAY = 24 * 60 * 60 * 1000;

/**
 * Adds whole days (24h steps, so the time of day is kept in UTC).
 * @param {Date|string|number} date
 * @param {number} days
 * @returns {Date}
 */
export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY);
}

/**
 * Last instant of the calendar month containing `now`, in UTC.
 * @param {Date} now
 * @returns {Date}
 */
export function endOfMonthUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1);
}

/**
 * Short spoken/printed date such as "Fri 13 Nov".
 * @param {Date|string} date
 * @param {string} [timeZone]
 */
export function shortDate(date, timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(new Date(date));
}
