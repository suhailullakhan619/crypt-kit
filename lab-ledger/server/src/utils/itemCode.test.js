// Short item IDs: sequential, numeric ordering past 9999, backfill never changes existing IDs.
import { defineResource } from '../core/defineResource.js';
import { nextCode, backfillCodes, formatCode, maxCodeNumber } from './itemCode.js';
import { create, update } from '../services/resourceService.js';
import { startDb, makeActor } from '../../test/db.js';
import config from '../../crypt.config.js';

const widgets = defineResource({
  key: 'widgets',
  label: 'Widgets',
  titleField: 'name',
  fields: {
    code: { type: 'string', unique: true, max: 16, search: true },
    name: { type: 'string', required: true },
  },
  permissions: { read: config.roles, create: config.roles, update: config.roles, delete: [] },
  hooks: {
    beforeCreate: async (d, ctx) => ({ ...d, code: await nextCode(ctx.registry.get('widgets').model, 'code', 'W', ctx.session) }),
    beforeUpdate: (_doc, { code: _keep, ...changes }) => changes,
  },
});

let db;
let user;
beforeAll(async () => { db = await startDb([widgets]); });
afterAll(() => db.stop());
beforeEach(async () => { await db.clear(); user = await makeActor(config.roles[0], 'Maker'); });
const resource = () => db.registry.get('widgets');

test('formatCode pads to four digits and grows beyond them', () => {
  expect(formatCode('SL', 7)).toBe('SL-0007');
  expect(formatCode('SL', 12345)).toBe('SL-12345');
});

test('records created through the normal path get W-0001, W-0002, ... and ignore a supplied ID', async () => {
  const a = await create(resource(), { name: 'A' }, user);
  const b = await create(resource(), { name: 'B', code: 'HACKED-1' }, user);
  expect([a.code, b.code]).toEqual(['W-0001', 'W-0002']);
});

test('numbering is numeric, so W-10000 follows W-9999', async () => {
  await widgets.model.insertMany([{ name: 'x', code: 'W-9999' }, { name: 'y', code: 'W-0042' }]);
  expect(await maxCodeNumber(widgets.model, 'code', 'W')).toBe(9999);
  expect((await create(resource(), { name: 'Z' }, user)).code).toBe('W-10000');
});

test('an ID cannot be changed by an edit', async () => {
  const a = await create(resource(), { name: 'A' }, user);
  const after = await update(resource(), String(a._id), { code: 'W-9999', name: 'A2' }, user);
  expect(after).toMatchObject({ code: 'W-0001', name: 'A2' });
});

test('backfill gives IDs to records without one, oldest first, and leaves existing IDs alone', async () => {
  await widgets.model.insertMany([
    { name: 'old', createdAt: new Date('2026-01-01') },
    { name: 'has', code: 'W-0005', createdAt: new Date('2026-01-02') },
    { name: 'new', createdAt: new Date('2026-01-03') },
  ]);
  expect(await backfillCodes(widgets.model, 'code', 'W')).toBe(2);
  const byName = Object.fromEntries((await widgets.model.find().lean()).map((d) => [d.name, d.code]));
  expect(byName).toEqual({ old: 'W-0006', has: 'W-0005', new: 'W-0007' });
  expect(await backfillCodes(widgets.model, 'code', 'W')).toBe(0); // nothing left to do
});

test('records without an ID do not clash with each other (the unique index skips them)', async () => {
  await expect(widgets.model.insertMany([{ name: 'a' }, { name: 'b' }])).resolves.toHaveLength(2);
  await expect(widgets.model.insertMany([{ name: 'c', code: 'W-0001' }, { name: 'd', code: 'W-0001' }])).rejects.toThrow(/duplicate key/);
});
