// Pantry Ghost: expiry notifications are one summary per status per day, for staff only
import { startDb, makeActor } from '../../test/db.js';
import { reclassifyAll } from './expiryService.js';
import { listFor } from './notificationService.js';
import Notification from '../models/Notification.js';
import donors from '../resources/donors.js';
import stockLots from '../resources/stock-lots.js';

let db;
beforeAll(async () => {
  db = await startDb([donors, stockLots]);
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();
});
afterAll(() => db.stop());
beforeEach(() => db.clear());

const NOW = new Date('2026-11-05T09:00:00Z');

test('tells the coordinator and volunteers with one summary per status, and not the board', async () => {
  const coordinator = await makeActor('Coordinator', 'Rosa');
  const volunteer = await makeActor('Volunteer', 'Sam');
  const board = await makeActor('Board', 'Ada');
  await stockLots.model.insertMany([
    { itemName: 'Milk', category: 'Dairy', quantity: 4, status: 'Fresh', expiresOn: new Date('2026-11-07') },
    { itemName: 'Yoghurt', category: 'Dairy', quantity: 4, status: 'Fresh', expiresOn: new Date('2026-11-06') },
    { itemName: 'Bread', category: 'Bakery', quantity: 2, status: 'ExpiringSoon', expiresOn: new Date('2026-11-04') },
  ]);

  await reclassifyAll(db.registry, NOW);

  const mine = await listFor(coordinator.userId);
  expect(mine.items.map((i) => i.title).sort()).toEqual([
    '1 lot has expired. Check and discard it.',
    '2 lots are expiring soon. Use them first.',
  ]);
  expect(mine.items.find((i) => i.kind === 'danger').link).toBe('/r/stock-lots?status=Expired');
  expect((await listFor(volunteer.userId)).unread).toBe(2);
  expect((await listFor(board.userId)).unread).toBe(0);
});

test('running the job again the same day adds nothing, and nothing changed means no notification', async () => {
  const coordinator = await makeActor('Coordinator', 'Rosa');
  await stockLots.model.insertMany([{ itemName: 'Milk', category: 'Dairy', quantity: 4, status: 'Fresh', expiresOn: new Date('2026-11-07') }]);
  await reclassifyAll(db.registry, NOW);
  await reclassifyAll(db.registry, NOW);
  expect((await listFor(coordinator.userId)).unread).toBe(1);
});
