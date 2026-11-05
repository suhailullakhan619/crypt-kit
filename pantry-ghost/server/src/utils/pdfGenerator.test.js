import { formatDuration, formatDate, formatDateTime, formatCell } from './pdfGenerator.js';

const MIN = 60000;

describe('report formatting', () => {
  test('durations read like "193d 23h 26m"', () => {
    expect(formatDuration(((193 * 24 + 23) * 60 + 26) * MIN)).toBe('193d 23h 26m');
    expect(formatDuration((4 * 60 + 56) * MIN)).toBe('4h 56m');
    expect(formatDuration((2 * 24 * 60 + 5) * MIN)).toBe('2d 0h 5m');
    expect(formatDuration(30 * 1000)).toBe('0m');
    expect(formatDuration(-1)).toBe('—');
  });

  test('dates use DD-MM-YYYY (and HH:mm) in the configured time zone', () => {
    const d = new Date('2026-11-04T16:30:00Z');
    expect(formatDate(d)).toBe('04-11-2026');
    expect(formatDateTime(d)).toBe('04-11-2026 16:30');
    expect(formatDateTime(d, 'Asia/Kolkata')).toBe('04-11-2026 22:00');
  });

  test('cells: midnight dates print as dates, others as date-times; refs, booleans, arrays, blanks', () => {
    expect(formatCell(new Date('2026-03-01T00:00:00Z'))).toBe('01-03-2026');
    expect(formatCell(new Date('2026-03-01T09:15:00Z'))).toBe('01-03-2026 09:15');
    expect(formatCell({ _id: 'x', name: 'Igor' })).toBe('Igor');
    expect(formatCell(true, 'boolean')).toBe('Yes');
    expect(formatCell(['A', 'B'])).toBe('A, B');
    expect(formatCell(null)).toBe('—');
  });
});
