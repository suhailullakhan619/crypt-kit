import mongoose from 'mongoose';
import { startDb, makeActor } from './db.js';
import labs from '../src/resources/labs.js';
import equipment from '../src/resources/equipment.js';
import checkouts from '../src/resources/checkouts.js';
import calibrations from '../src/resources/calibrations.js';

export const LAB_RESOURCES = [labs, equipment, checkouts, calibrations];
export { labs, equipment, checkouts, calibrations, makeActor };

/** In-memory replica set with the four Lab Ledger resources registered. */
export function startLabDb() {
  return startDb(LAB_RESOURCES);
}

let seq = 0;
/** Inserts one equipment item directly (bypassing hooks, like the seed does). */
export async function makeEquipment(overrides = {}) {
  seq += 1;
  const [doc] = await equipment.model.create([{
    name: `Test Oscilloscope ${seq}`,
    assetTag: `T-${String(seq).padStart(5, '0')}-${new mongoose.Types.ObjectId().toString().slice(-4).toUpperCase()}`,
    category: 'Measurement',
    status: 'Available',
    condition: 'Good',
    ...overrides,
  }]);
  return doc;
}

/** Fixed clock for deterministic tests. */
export const NOW = new Date('2026-11-05T10:00:00.000Z');
