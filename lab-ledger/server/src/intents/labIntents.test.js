// Lab voice intents: phrasing coverage and answers (lab-ledger Req 6.1, 6.2)
import { parseIntent } from '../core/intentRegistry.js';
import { builtinIntents } from '../core/builtinIntents.js';
import { createRegistry } from '../core/registry.js';
import { LAB_RESOURCES } from '../../test/lab.js';
import whoHas from './whoHas.js';
import isAvailable from './isAvailable.js';
import calibrationDue from './calibrationDue.js';
import overdueReturns from './overdueReturns.js';

const APP = [whoHas, isAvailable, calibrationDue, overdueReturns];
const intents = [...APP, ...builtinIntents(createRegistry(LAB_RESOURCES))];

test.each([
  ['Who has the oscilloscope?', 'WHO_HAS', { query: 'the oscilloscope' }],
  ["Who's got the pH meter right now", 'WHO_HAS', { query: 'the ph meter' }],
  ['who has LL-0042', 'WHO_HAS', { query: 'll-0042' }],
  ['Is the centrifuge available?', 'IS_AVAILABLE', { query: 'the centrifuge' }],
  ['can I borrow the thermal camera', 'IS_AVAILABLE', { query: 'the thermal camera' }],
  ['What needs calibration this month?', 'CALIBRATION_DUE', {}],
  ['which equipment is due for calibration', 'CALIBRATION_DUE', {}],
  ['Which items are overdue?', 'OVERDUE_RETURNS', {}],
  ['which equipment is overdue', 'OVERDUE_RETURNS', {}],
  ["who's late", 'OVERDUE_RETURNS', {}],
  ['how many equipment are checked out', 'COUNT_BY_VALUE', undefined],
])('"%s" → %s', (text, intent, params) => {
  const got = parseIntent(text, intents);
  expect(got.intent).toBe(intent);
  if (params) expect(got.params).toEqual(params);
});

test('every example parses to its own intent', () => {
  for (const i of APP) for (const ex of i.examples) expect(parseIntent(ex, intents).intent).toBe(i.name);
});

test('answers', () => {
  const item = { name: 'Digital Oscilloscope', assetTag: 'LL-0001', status: 'Available', lab: 'Physics B-12' };
  expect(whoHas.respond({ query: 'x', matches: [], total: 0 })).toMatch(/couldn't find/);
  expect(whoHas.respond({ query: 'x', matches: [item, { ...item, assetTag: 'LL-0002' }, { ...item, assetTag: 'LL-0003' }, item], total: 4 }))
    .toBe('I found 4: LL-0001, LL-0002 and LL-0003, and more. Which one do you mean?');
  expect(whoHas.respond({ matches: [item], total: 1, checkout: { borrower: 'Priya', due: 'Fri 13 Nov', status: 'Overdue' } }))
    .toBe('Priya has the Digital Oscilloscope (LL-0001), due back Fri 13 Nov — it is overdue.');
  expect(whoHas.respond({ matches: [item], total: 1, checkout: null })).toBe('Nobody — the Digital Oscilloscope (LL-0001) is on the shelf in Physics B-12.');
  expect(isAvailable.respond({ matches: [{ ...item, status: 'CalibrationDue' }], total: 1 })).toBe('No — the Digital Oscilloscope (LL-0001) is calibration due.');
  expect(overdueReturns.respond({ count: 2, detailed: false, items: [] })).toBe('2 items are overdue.');
  expect(calibrationDue.respond({ count: 0, by: 'Mon 30 Nov', items: [] })).toMatch(/^Nothing needs calibration before Mon 30 Nov/);
});
