import { readDayNumber, readNumber } from './numberWords.js';
import { DAY, startOfDay, utcDate } from './dates.js';

/**
 * Spoken and written dates (Req 4.2, 4.3). Pure: `now` is always passed in. Results are UTC midnight.
 *
 * Understands:
 *  - "2027-03-03"
 *  - "March 3rd", "march third", "mar 3", "March 3rd 2027", "March twenty-third"
 *  - "3 March", "3rd of March", "the third of March", "3 March 2027"
 *  - "today", "tomorrow", "<weekday>", "this <weekday>", "next <weekday>"
 *  - "in 2 weeks", "in ten days", "in a week", "in a month"
 *
 * Without a year, the next occurrence on or after today is chosen (Req 4.3).
 * "next <weekday>" is the first such weekday strictly after today; "<weekday>" / "this <weekday>"
 * may be today.
 */

export const MONTHS = Object.freeze({
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
});
export const WEEKDAYS = Object.freeze(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']);

const isYear = (t) => /^(19|20)\d{2}$/.test(t ?? '');

/**
 * The next calendar date (month, day) on or after today; skips years where it does not exist
 * (29 February).
 */
export function nextOccurrence(monthIndex, day, now) {
  const today = startOfDay(now);
  for (let y = today.getUTCFullYear(); y <= today.getUTCFullYear() + 8; y++) {
    const d = utcDate(y, monthIndex, day);
    if (d && d.getTime() >= today.getTime()) return d;
  }
  return null;
}

function monthDay(monthIndex, day, yearToken, now) {
  if (!(day >= 1 && day <= 31)) return null;
  if (isYear(yearToken)) return utcDate(Number(yearToken), monthIndex, day);
  return nextOccurrence(monthIndex, day, now);
}

/**
 * Reads a date starting at tokens[i].
 * @param {string[]} tokens - lowercase tokens
 * @param {number} i
 * @param {Date} now
 * @returns {{ date: Date, length: number } | null}
 */
export function readDate(tokens, i, now) {
  const t = tokens[i];
  if (!t) return null;
  const today = startOfDay(now);

  // ISO
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    const d = utcDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d ? { date: d, length: 1 } : null;
  }

  if (t === 'today') return { date: today, length: 1 };
  if (t === 'tomorrow') return { date: new Date(today.getTime() + DAY), length: 1 };

  // weekdays
  const wdAt = (j) => WEEKDAYS.indexOf(tokens[j]);
  if ((t === 'next' || t === 'this') && wdAt(i + 1) >= 0) {
    let diff = (wdAt(i + 1) - today.getUTCDay() + 7) % 7;
    if (t === 'next' && diff === 0) diff = 7;
    return { date: new Date(today.getTime() + diff * DAY), length: 2 };
  }
  if (wdAt(i) >= 0) {
    const diff = (wdAt(i) - today.getUTCDay() + 7) % 7;
    return { date: new Date(today.getTime() + diff * DAY), length: 1 };
  }
  if (t === 'next' && tokens[i + 1] === 'week') return { date: new Date(today.getTime() + 7 * DAY), length: 2 };

  // in N days / weeks / months
  if (t === 'in') {
    let n = null;
    let len = 0;
    if (tokens[i + 1] === 'a' || tokens[i + 1] === 'an') { n = 1; len = 1; }
    else {
      const r = readNumber(tokens, i + 1);
      if (r) { n = r.value; len = r.length; }
    }
    const unit = tokens[i + 1 + len];
    if (n !== null && Number.isInteger(n) && n >= 0 && n <= 1000) {
      if (unit === 'day' || unit === 'days') return { date: new Date(today.getTime() + n * DAY), length: 2 + len };
      if (unit === 'week' || unit === 'weeks') return { date: new Date(today.getTime() + n * 7 * DAY), length: 2 + len };
      if (unit === 'month' || unit === 'months') {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + n, today.getUTCDate()));
        return { date: d, length: 2 + len };
      }
    }
    return null;
  }

  // <month> <day> [year]
  if (MONTHS[t] !== undefined) {
    let j = i + 1;
    if (tokens[j] === 'the') j += 1;
    const day = readDayNumber(tokens, j);
    if (!day) return null;
    j += day.length;
    const year = isYear(tokens[j]) ? tokens[j] : null;
    const d = monthDay(MONTHS[t], day.value, year, now);
    return d ? { date: d, length: j - i + (year ? 1 : 0) } : null;
  }

  // [the] <day> [of] <month> [year]
  let j = i;
  if (t === 'the') j += 1;
  const day = readDayNumber(tokens, j);
  if (day) {
    j += day.length;
    if (tokens[j] === 'of') j += 1;
    if (MONTHS[tokens[j]] !== undefined) {
      const monthIndex = MONTHS[tokens[j]];
      j += 1;
      const year = isYear(tokens[j]) ? tokens[j] : null;
      const d = monthDay(monthIndex, day.value, year, now);
      return d ? { date: d, length: j - i + (year ? 1 : 0) } : null;
    }
  }
  return null;
}

/** True when tokens[i] could begin a month-name or ISO date (used to find unmarked dates). */
export function looksLikeDateStart(tokens, i) {
  const t = tokens[i];
  return /^\d{4}-\d{2}-\d{2}$/.test(t ?? '') || MONTHS[t] !== undefined || (/^\d{1,2}(st|nd|rd|th)?$/.test(t ?? '') && (MONTHS[tokens[i + 1]] !== undefined || (tokens[i + 1] === 'of' && MONTHS[tokens[i + 2]] !== undefined)));
}
