// Pantry Ghost stock lots carry a short item ID (SL-0001) from intake, the form and CSV import.
import { startDb, makeActor } from '../../test/db.js';
import donors from '../resources/donors.js';
import stockLots from '../resources/stock-lots.js';
import { create, update } from './resourceService.js';
import { save as saveIntake } from './intakeService.js';
import { importCsv } from './csvImportService.js';
import job from '../jobs/app/itemCodes.job.js';

let db;
let user;
beforeAll(async () => { db = await startDb([donors, stockLots]); });
afterAll(() => db.stop());
beforeEach(async () => { await db.clear(); user = await makeActor('Coordinator', 'Rosa'); });
const lots = () => db.registry.get('stock-lots');

test('the form, intake and CSV import all give lots sequential item IDs', async () => {
  const a = await create(lots(), { itemName: 'Rice', category: 'Dry', quantity: 5 }, user);
  const saved = await saveIntake({ lots: [{ itemName: 'Beans', category: 'Canned', quantity: 12, unit: 'can' }, { itemName: 'Milk', category: 'Dairy', quantity: 4 }] }, user);
  await importCsv(lots(), 'Item ID,Item,Category,Quantity\nFAKE-1,Pasta,Dry,3\n', user, { dryRun: false });
  const codes = (await stockLots.model.find().sort({ code: 1 }).lean()).map((l) => l.code);
  expect(a.code).toBe('SL-0001');
  expect(saved.items ?? saved).toBeTruthy();
  expect(codes).toEqual(['SL-0001', 'SL-0002', 'SL-0003', 'SL-0004']);
  expect(codes).not.toContain('FAKE-1');
});

test('an edit cannot change the item ID, but other fields still update', async () => {
  const a = await create(lots(), { itemName: 'Rice', category: 'Dry', quantity: 5 }, user);
  const after = await update(lots(), String(a._id), { code: 'SL-9999', quantity: 3 }, user);
  expect(after).toMatchObject({ code: 'SL-0001', quantity: 3 });
});

test('the boot job gives IDs to lots saved before IDs existed', async () => {
  await stockLots.model.insertMany([{ itemName: 'Old', category: 'Dry', quantity: 1, status: 'Fresh' }]);
  expect(await job.run({ registry: db.registry })).toEqual({ 'stock-lots': 1 });
  expect((await stockLots.model.findOne({ itemName: 'Old' }).lean()).code).toBe('SL-0001');
  expect(job).toMatchObject({ name: 'item-codes', runAtBoot: true });
});
