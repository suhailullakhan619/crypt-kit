import { parseRange, parseMoment } from './when.js';

// Thursday 19 November 2026, 10:00 UTC
const NOW = new Date('2026-11-19T10:00:00.000Z');
const iso = (d) => d.toISOString();

describe('parseRange', () => {
  const range = (t, now = NOW, tz = 0) => { const r = parseRange(t, now, tz); return r && { from: iso(r.from), to: iso(r.to), label: r.label, rest: r.rest }; };

  test('today, tomorrow and yesterday are whole days (end exclusive)', () => {
    expect(range('due today')).toEqual({ from: '2026-11-19T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z', label: 'today', rest: 'due' });
    expect(range('notes tomorrow')).toMatchObject({ from: '2026-11-20T00:00:00.000Z', to: '2026-11-21T00:00:00.000Z', label: 'tomorrow' });
    expect(range('done yesterday')).toMatchObject({ from: '2026-11-18T00:00:00.000Z', to: '2026-11-19T00:00:00.000Z' });
  });

  test('weeks run Monday to Monday', () => {
    expect(range('this week')).toMatchObject({ from: '2026-11-16T00:00:00.000Z', to: '2026-11-23T00:00:00.000Z' });
    expect(range('next week')).toMatchObject({ from: '2026-11-23T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' });
    expect(range('last week')).toMatchObject({ from: '2026-11-09T00:00:00.000Z', to: '2026-11-16T00:00:00.000Z' });
  });

  test('months', () => {
    expect(range('this month')).toMatchObject({ from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' });
    expect(range('next month')).toMatchObject({ from: '2026-12-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' });
    expect(range('last month')).toMatchObject({ from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' });
  });

  test('"next N days" starts today; "last N days" ends today', () => {
    expect(range('in the next 7 days')).toMatchObject({ from: '2026-11-19T00:00:00.000Z', to: '2026-11-26T00:00:00.000Z' });
    expect(range('over the last 3 days')).toMatchObject({ from: '2026-11-16T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z' });
    expect(range('next 2 weeks')).toMatchObject({ to: '2026-12-03T00:00:00.000Z' });
  });

  test('a weekday means the coming one (today counts)', () => {
    expect(range('due friday')).toMatchObject({ from: '2026-11-20T00:00:00.000Z', label: 'on friday' });
    expect(range('on thursday')).toMatchObject({ from: '2026-11-19T00:00:00.000Z' });
    expect(range('next monday')).toMatchObject({ from: '2026-11-23T00:00:00.000Z' });
  });

  test('"today" follows the asker\'s timezone, not the server\'s', () => {
    // 22:00 UTC on the 19th is already 03:30 on the 20th in India (UTC+5:30, offset -330)
    expect(range('today', new Date('2026-11-19T22:00:00.000Z'), -330)).toMatchObject({ from: '2026-11-19T18:30:00.000Z', to: '2026-11-20T18:30:00.000Z' });
  });

  test('returns null when there is no date phrase', () => {
    expect(parseRange('how many notes are there', NOW)).toBeNull();
  });
});

describe('parseMoment', () => {
  const at = (t, now = NOW, tz = 0) => { const m = parseMoment(t, now, tz); return m && { date: iso(m.date), rest: m.rest }; };

  test('a day plus a time', () => {
    expect(at('call mum tomorrow at 5pm')).toEqual({ date: '2026-11-20T17:00:00.000Z', rest: 'call mum' });
    expect(at('friday at noon')).toMatchObject({ date: '2026-11-20T12:00:00.000Z' });
    expect(at('tomorrow at 5 30pm')).toMatchObject({ date: '2026-11-20T17:30:00.000Z' });
    expect(at('today at 12am')).toMatchObject({ date: '2026-11-19T00:00:00.000Z' });
  });

  test('a day alone means 9am; a time alone means the next time it happens', () => {
    expect(at('tomorrow')).toMatchObject({ date: '2026-11-20T09:00:00.000Z' });
    expect(at('at 5pm')).toMatchObject({ date: '2026-11-19T17:00:00.000Z' });
    expect(at('at 9am')).toMatchObject({ date: '2026-11-20T09:00:00.000Z' }); // 9am has passed today
  });

  test('relative times', () => {
    expect(at('in 90 minutes')).toMatchObject({ date: '2026-11-19T11:30:00.000Z' });
    expect(at('in 2 hours')).toMatchObject({ date: '2026-11-19T12:00:00.000Z' });
    expect(at('water plants in 3 days')).toEqual({ date: '2026-11-22T10:00:00.000Z', rest: 'water plants' });
  });

  test('uses the asker\'s clock', () => {
    // 5pm in India is 11:30 UTC
    expect(at('tomorrow at 5pm', NOW, -330)).toMatchObject({ date: '2026-11-20T11:30:00.000Z' });
  });

  test('null without a day or a time; ignores impossible clock values', () => {
    expect(parseMoment('buy milk', NOW)).toBeNull();
    expect(parseMoment('call at 99', NOW)).toBeNull();
  });
});
