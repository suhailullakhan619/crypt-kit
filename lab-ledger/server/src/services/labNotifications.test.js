// Lab Ledger notifications: who is told when a loan goes overdue or equipment needs calibration
import { sweep } from './sweeperService.js';
import { listFor } from './notificationService.js';
import Notification from '../models/Notification.js';
import { startLabDb, makeActor, makeEquipment, checkouts, NOW } from '../../test/lab.js';

let db;
beforeAll(async () => {
  db = await startLabDb();
  await Notification.createCollection().catch(() => {});
  await Notification.syncIndexes();
});
afterAll(() => db.stop());
beforeEach(() => db.clear());

const LATER = new Date(NOW.getTime() + 60 * 86400000);

test('an overdue loan notifies the borrower, the technician and the lab manager, once each', async () => {
  const student = await makeActor('Student', 'Ada');
  const otherStudent = await makeActor('Student', 'Ben');
  const tech = await makeActor('Technician', 'Tess');
  const manager = await makeActor('LabManager', 'Maya');
  const item = await makeEquipment({ name: 'Microscope', status: 'CheckedOut' });
  await checkouts.model.create({
    equipment: item._id, borrower: student.userId, status: 'Active',
    dueBack: new Date(NOW.getTime() - 86400000), checkedOutAt: new Date(NOW.getTime() - 5 * 86400000),
  });

  await sweep(db.registry, NOW);
  await sweep(db.registry, LATER);

  for (const who of [student, tech, manager]) expect((await listFor(who.userId)).unread).toBe(1);
  expect((await listFor(otherStudent.userId)).unread).toBe(0);
  // The checkout's title is its equipment: the message must name the item, not show a database id.
  const title = (await listFor(student.userId)).items[0].title;
  expect(title).toBe('Checkout "Microscope" is now Overdue');
  expect(title).not.toMatch(/[0-9a-f]{24}|object Object/);
});

test('equipment turning CalibrationDue notifies technicians and the manager, not students', async () => {
  const student = await makeActor('Student', 'Ada');
  const tech = await makeActor('Technician', 'Tess');
  const manager = await makeActor('LabManager', 'Maya');
  await makeEquipment({ name: 'Centrifuge', requiresCalibration: true, nextCalibration: new Date(NOW.getTime() - 86400000) });

  await sweep(db.registry, NOW);

  expect((await listFor(tech.userId)).items[0].title).toMatch(/Centrifuge.*CalibrationDue/);
  expect((await listFor(manager.userId)).unread).toBe(1);
  expect((await listFor(student.userId)).unread).toBe(0);
});
