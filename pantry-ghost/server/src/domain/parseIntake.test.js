// Intake parser examples and regression cases (Req 4.1–4.4)
import { parseIntake, editDistance, tokenize } from './parseIntake.js';
import { readDate } from './dateWords.js';
import { readNumber } from './numberWords.js';

const donors = [{ _id: 'fm', name: 'Fresh Mart' }, { _id: 'gv', name: 'Green Valley Farm' }];
const now = new Date('2026-11-05T10:00:00Z'); // a Thursday
const iso = (d) => d?.toISOString().slice(0, 10) ?? null;
const parse = (t) => parseIntake(t, { donors, now });

test('the headline sentence', () => {
  const d = parse('add twelve cans of black beans expiring March 3rd from Fresh Mart');
  expect(d).toMatchObject({ quantity: 12, unit: 'can', itemName: 'Black beans', category: 'Canned', donorId: 'fm', missing: [], confidence: 1 });
  expect(iso(d.expiresOn)).toBe('2027-03-03');
});

test.each([
  ['log 2 kg apples from green valley farm best before next friday', { quantity: 2, unit: 'kg', category: 'Produce', donorId: 'gv' }, '2026-11-06'],
  ['twenty-four litres of milk use by 2026-11-09 from frsh mrt', { quantity: 24, unit: 'L', category: 'Dairy', donorId: 'fm', location: 'Fridge' }, '2026-11-09'],
  ['a box of cereal expires in 2 weeks', { quantity: 1, unit: 'box', category: 'Dry' }, '2026-11-19'],
  ['100 cans soup expiring the third of march 2027', { quantity: 100, category: 'Canned' }, '2027-03-03'],
  ['a dozen eggs expiring tomorrow', { quantity: 12, unit: 'item', category: 'Dairy' }, '2026-11-06'],
  ['6 jars of peanut butter expiring 1 june', { category: 'Dry', unit: 'item' }, '2027-06-01'],
  ['3 tins of tuna expiring november 5', { category: 'Canned' }, '2026-11-05'],
  ['5 bags of frozen peas expiring in a month', { category: 'Frozen', location: 'Freezer' }, '2026-12-05'],
])('%s', (text, fields, expires) => {
  const d = parse(text);
  expect(d).toMatchObject(fields);
  expect(iso(d.expiresOn)).toBe(expires);
});

test('missing fields are listed and lower the confidence', () => {
  const d = parse('some mystery stuff');
  expect(d.missing).toEqual(['quantity', 'category', 'expiresOn']);
  expect(d.confidence).toBeCloseTo(0.4);
  expect(parse('ten').missing).toEqual(['itemName', 'category', 'expiresOn']);
});

test('hygiene items need no expiry date', () => {
  expect(parse('10 bars of soap')).toMatchObject({ category: 'Hygiene', missing: [], expiresOn: null });
});

test('an unknown donor is reported, not swallowed into the item name', () => {
  const d = parse('5 loaves of bread from Bob exp tomorrow');
  expect(d).toMatchObject({ itemName: 'Bread', donorId: null, donorGuess: 'bob' });
});

test('"expiring soon" never leaks into the item name', () => {
  expect(parse('4 cartons of milk expiring soon').itemName).toBe('Milk');
  expect(parse('4 cartons of milk expiring soon').missing).toContain('expiresOn');
});

test('year rollover: a date earlier this year means next year (Req 4.3)', () => {
  expect(iso(readDate(['march', '3'], 0, now).date)).toBe('2027-03-03');
  expect(iso(readDate(['december', '1st'], 0, now).date)).toBe('2026-12-01');
  expect(iso(readDate(['november', '5'], 0, now).date)).toBe('2026-11-05');
  // 29 February only exists in leap years → the next one
  expect(iso(readDate(['february', '29th'], 0, now).date)).toBe('2028-02-29');
});

test('number words up to one hundred', () => {
  expect(readNumber(['ninety-nine'], 0)).toEqual({ value: 99, length: 1 });
  expect(readNumber(['seventy', 'three'], 0)).toEqual({ value: 73, length: 2 });
  expect(readNumber(['one', 'hundred'], 0)).toEqual({ value: 100, length: 2 });
  expect(readNumber(['two', 'dozen'], 0)).toEqual({ value: 24, length: 2 });
});

// fast-check counterexample (P5): the typo "food" → "good" made the donor phrase stop at the
// first word of the "good until" date marker, so the donor was never recognised.
test('regression: a donor word that starts a multi-word date marker does not end the donor phrase', () => {
  const ds = [{ _id: 'd07', name: 'Northgate School Food Drive' }];
  const d = parseIntake('LOG FROM NORTHGATE SCHOOL GOOD DRIVE, 2 POUNDS OF MILK, USE BY IN SIX DAYS', { donors: ds, now: new Date('2026-01-01T00:00:00.000Z') });
  expect(d).toMatchObject({ quantity: 2, unit: 'lb', category: 'Dairy', donorId: 'd07' });
  expect(iso(d.expiresOn)).toBe('2026-01-07');
});

test('helpers', () => {
  expect(editDistance('fresh mart', 'frsh mrt')).toBe(2);
  expect(tokenize('2kg of Rice, please!')).toEqual(['2', 'kg', 'of', 'rice', 'please']);
});
