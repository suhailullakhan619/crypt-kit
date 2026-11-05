// Pantry voice intents: matching, answers and permissions (Req 6.1, 6.2)
import { startDb, makeActor } from '../../test/db.js';
import { RESOURCES, donors, stockLots, households, distributions } from '../../test/pantry.js';
import { buildIntents, parseIntent } from '../core/intentRegistry.js';
import { answer } from '../services/voiceService.js';

let db;
let roles;
const NOW = new Date('2026-11-05T10:00:00Z');

beforeAll(async () => {
  db = await startDb(RESOURCES);
  db.ctx.intents = await buildIntents(db.registry);
  roles = {
    Coordinator: await makeActor('Coordinator', 'Rosa'),
    Volunteer: await makeActor('Volunteer', 'Sam'),
    Board: await makeActor('Board', 'Ada'),
  };
  const [fm] = await donors.model.insertMany([{ name: 'Fresh Mart', type: 'Grocery' }]);
  await stockLots.model.insertMany([
    { itemName: 'Black beans', category: 'Canned', unit: 'can', quantity: 48, status: 'Fresh', expiresOn: new Date('2027-03-01'), donor: fm._id },
    { itemName: 'Tomato soup', category: 'Canned', unit: 'can', quantity: 12, status: 'Fresh', expiresOn: new Date('2026-11-09') },
    { itemName: 'Rice', category: 'Dry', unit: 'kg', quantity: 6, status: 'Fresh', expiresOn: new Date('2027-05-01') },
    { itemName: 'Milk', category: 'Dairy', unit: 'L', quantity: 10, status: 'ExpiringSoon', location: 'Fridge', expiresOn: new Date('2026-11-06') },
    { itemName: 'Old milk', category: 'Dairy', unit: 'L', quantity: 5, status: 'Expired', expiresOn: new Date('2026-11-01') },
    { itemName: 'Gone beans', category: 'Canned', unit: 'can', quantity: 0, status: 'Depleted' },
  ]);
  const hhs = await households.model.insertMany([{ code: 'H-0001', size: 4 }, { code: 'H-0002', size: 2 }, { code: 'H-0003', size: 5 }]);
  await distributions.model.insertMany([
    { household: hhs[0]._id, at: new Date('2026-11-02'), totalUnits: 3, summary: 'x' },
    { household: hhs[0]._id, at: new Date('2026-11-04'), totalUnits: 3, summary: 'x' },
    { household: hhs[1]._id, at: new Date('2026-11-03'), totalUnits: 3, summary: 'x' },
    { household: hhs[2]._id, at: new Date('2026-10-20'), totalUnits: 3, summary: 'x' },
  ]);
});
afterAll(() => db.stop());

const ask = (text, role = 'Coordinator') => answer(text, roles[role], { now: NOW });

test.each([
  ['add twelve cans of black beans expiring March 3rd from Fresh Mart', 'INTAKE'],
  ['Log 2 kg of apples, best before next Friday', 'INTAKE'],
  ['What expires this week?', 'EXPIRING_THIS_WEEK'],
  ["what's expiring soon", 'EXPIRING_THIS_WEEK'],
  ['How much canned food do we have?', 'STOCK_OF'],
  ['how many cans of black beans do we have', 'STOCK_OF'],
  ['How many households did we serve this month?', 'HOUSEHOLDS_SERVED'],
  ['how many families did we help last month', 'HOUSEHOLDS_SERVED'],
  ['how many households are there', 'COUNT_ALL'],
])('"%s" → %s', (text, intent) => {
  expect(parseIntent(text, db.ctx.intents).intent).toBe(intent);
});

test('INTAKE returns a draft and never saves', async () => {
  const before = await stockLots.model.countDocuments();
  const r = await ask('add twelve cans of black beans expiring March 3rd from Fresh Mart', 'Volunteer');
  expect(r.intent).toBe('INTAKE');
  expect(r.data.saved).toBe(false);
  expect(r.data.draft).toMatchObject({ quantity: 12, unit: 'can', category: 'Canned', donorName: 'Fresh Mart', missing: [] });
  expect(r.answer).toBe('I heard 12 cans of black beans, expiring 3 March 2027, from Fresh Mart — say confirm or edit it on screen.');
  expect(await stockLots.model.countDocuments()).toBe(before);
});

test('INTAKE tells what was missed, and refuses Board politely', async () => {
  expect((await ask('add some mystery boxes')).answer).toMatch(/I didn't catch how many, the category and the expiry date\.$/);
  const board = await ask('add 3 cans of beans expiring march 3', 'Board');
  expect(board).toMatchObject({ intent: 'INTAKE', data: { denied: true } });
  expect(board.answer).toMatch(/only coordinators and volunteers/);
});

test('EXPIRING_THIS_WEEK lists usable lots soonest first', async () => {
  const r = await ask('what expires this week', 'Board');
  expect(r.data.count).toBe(2);
  expect(r.answer).toBe('2 lots expire in the next 7 days. Use first: 10 litres of milk (Fri 6 Nov, fridge) and 12 cans of tomato soup (Mon 9 Nov, shelf).');
});

test('STOCK_OF sums usable quantity per unit for a category, an item or everything', async () => {
  expect((await ask('how much canned food do we have', 'Board')).answer).toBe('We have 60 cans of canned food (2 lots).');
  expect((await ask('how many cans of black beans do we have', 'Board')).answer).toBe('We have 48 cans of black beans (1 lot).');
  expect((await ask('how much food do we have', 'Board')).data.byUnit).toEqual(expect.arrayContaining([{ unit: 'can', quantity: 60 }, { unit: 'L', quantity: 10 }, { unit: 'kg', quantity: 6 }]));
  expect((await ask('how many pineapples do we have', 'Board')).answer).toBe("We don't have any pineapples in stock right now.");
});

test('HOUSEHOLDS_SERVED is aggregate-only and allowed for Board (Req 6.2)', async () => {
  const r = await ask('how many households did we serve this month', 'Board');
  expect(r.data).toEqual({ households: 2, people: 6, distributions: 3, month: 'November 2026', which: 'this' });
  expect(r.answer).toBe('We served 2 households — 6 people — with 3 distributions in November 2026 so far.');
  expect((await ask('how many households did we serve last month', 'Board')).data).toMatchObject({ households: 1, people: 5 });
  // …while the record-level built-ins stay closed to Board
  expect((await ask('how many households are there', 'Board')).answer).toBe("Sorry, you don't have access to Households.");
});
