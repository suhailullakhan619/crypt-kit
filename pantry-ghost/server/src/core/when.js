/**
 * Date phrases for questions and commands ("due this week", "remind me tomorrow at 5pm").
 * Pure functions. `tz` is the asker's offset in minutes as returned by `Date#getTimezoneOffset()`
 * (UTC+5:30 is -330), so "today" and "5pm" mean the asker's today and 5pm, not the server's.
 * Input is already normalised (lower case, no punctuation).
 */
const MIN = 60000;
const DAY = 86400000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Shifts a real instant onto a clock whose UTC fields read as the asker's local time. */
const local = (d, tz) => new Date(d.getTime() - tz * MIN);
const real = (d, tz) => new Date(d.getTime() + tz * MIN);
const dayStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const plusDays = (d, n) => new Date(d.getTime() + n * DAY);
const monday = (d) => plusDays(dayStart(d), -((d.getUTCDay() + 6) % 7));
const monthStart = (d, n = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

const strip = (t, m) => `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
const UNIT_DAYS = { day: 1, days: 1, week: 7, weeks: 7 };

/**
 * First date range mentioned in `t`, as `{ from, to, label, rest }` where `from` is inclusive,
 * `to` exclusive and `rest` is `t` without the phrase. Null when there is none.
 * @param {string} t
 * @param {Date} now
 * @param {number} [tz]
 */
export function parseRange(t, now, tz = 0) {
  const today = dayStart(local(now, tz));
  const out = (from, to, label, m) => ({ from: real(from, tz), to: real(to, tz), label, rest: strip(t, m) });
  let m = t.match(/\b(?:in the |in |within the |within )?next (\d{1,3}) (days?|weeks?)\b/);
  if (m) return out(today, plusDays(today, Number(m[1]) * UNIT_DAYS[m[2]]), `in the next ${m[1]} ${m[2]}`, m);
  m = t.match(/\b(?:in the |over the |during the )?(?:last|past) (\d{1,3}) (days?|weeks?)\b/);
  if (m) return out(plusDays(today, -Number(m[1]) * UNIT_DAYS[m[2]]), plusDays(today, 1), `in the last ${m[1]} ${m[2]}`, m);
  m = t.match(/\b(today|tonight)\b/);
  if (m) return out(today, plusDays(today, 1), 'today', m);
  m = t.match(/\btomorrow\b/);
  if (m) return out(plusDays(today, 1), plusDays(today, 2), 'tomorrow', m);
  m = t.match(/\byesterday\b/);
  if (m) return out(plusDays(today, -1), today, 'yesterday', m);
  m = t.match(/\bthis week\b/);
  if (m) return out(monday(today), plusDays(monday(today), 7), 'this week', m);
  m = t.match(/\bnext week\b/);
  if (m) return out(plusDays(monday(today), 7), plusDays(monday(today), 14), 'next week', m);
  m = t.match(/\blast week\b/);
  if (m) return out(plusDays(monday(today), -7), monday(today), 'last week', m);
  m = t.match(/\bthis month\b/);
  if (m) return out(monthStart(today), monthStart(today, 1), 'this month', m);
  m = t.match(/\bnext month\b/);
  if (m) return out(monthStart(today, 1), monthStart(today, 2), 'next month', m);
  m = t.match(/\blast month\b/);
  if (m) return out(monthStart(today, -1), monthStart(today), 'last month', m);
  m = t.match(/\bsoon\b/);
  if (m) return out(today, plusDays(today, 7), 'in the next 7 days', m);
  m = t.match(new RegExp(`\\b(?:on |next |this )?(${WEEKDAYS.join('|')})\\b`));
  if (m) {
    const ahead = (WEEKDAYS.indexOf(m[1]) - today.getUTCDay() + 7) % 7;
    return out(plusDays(today, ahead), plusDays(today, ahead + 1), `on ${m[1]}`, m);
  }
  return null;
}

/**
 * A single moment for a reminder ("tomorrow at 5pm", "in 2 hours", "friday at noon"):
 * `{ date, label, rest }`, or null when `t` names no day and no time.
 * A day alone means 9am; a time alone means today (tomorrow if it has already passed).
 */
export function parseMoment(t, now, tz = 0) {
  const nowLocal = local(now, tz);
  const today = dayStart(nowLocal);
  let rest = t;
  const cut = (m) => { rest = strip(rest, m); };

  const rel = rest.match(/\bin (\d{1,3}) (minutes?|mins?|hours?|hrs?|days?|weeks?)\b/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2][0] === 'm' ? MIN : rel[2][0] === 'h' ? 60 * MIN : rel[2][0] === 'd' ? DAY : 7 * DAY;
    cut(rel);
    return { date: new Date(now.getTime() + n * unit), label: `in ${rel[1]} ${rel[2]}`, rest };
  }

  let dayOffset = null;
  let label = '';
  let m = rest.match(/\b(today|tonight)\b/);
  if (m) { dayOffset = 0; label = m[1]; cut(m); }
  if (dayOffset === null && (m = rest.match(/\btomorrow\b/))) { dayOffset = 1; label = 'tomorrow'; cut(m); }
  if (dayOffset === null && (m = rest.match(new RegExp(`\\b(?:on |next |this )?(${WEEKDAYS.join('|')})\\b`)))) {
    dayOffset = (WEEKDAYS.indexOf(m[1]) - today.getUTCDay() + 7) % 7;
    label = m[1];
    cut(m);
  }

  let minutes = null;
  if ((m = rest.match(/\b(noon|midday)\b/))) { minutes = 12 * 60; cut(m); }
  else if ((m = rest.match(/\bmidnight\b/))) { minutes = 0; cut(m); }
  else if ((m = rest.match(/\bat (\d{1,2})(?: (\d{2}))? ?(am|pm)?\b/) ?? rest.match(/\b(\d{1,2})(?: (\d{2}))? ?(am|pm)\b/))) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h <= 23 && min <= 59) {
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      minutes = h * 60 + min;
      cut(m);
    }
  } else if (label === 'tonight') minutes = 20 * 60;

  if (dayOffset === null && minutes === null) return null;
  const day = plusDays(today, dayOffset ?? 0);
  let when = new Date(day.getTime() + (minutes ?? 9 * 60) * MIN);
  if (dayOffset === null && when <= nowLocal) when = plusDays(when, 1);
  const clock = minutes === null ? '' : ` at ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { date: real(when, tz), label: `${label || (dayOffset === null && when.getTime() - today.getTime() >= DAY ? 'tomorrow' : 'today')}${clock}`.trim(), rest };
}
