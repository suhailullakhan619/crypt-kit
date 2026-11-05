import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createRegistry } from '../src/core/registry.js';
import { useTestContext } from './helpers.js';
import User from '../src/models/User.js';

/**
 * Starts an in-memory replica set (transactions work), connects Mongoose and installs a
 * test context whose registry holds `resources`. Returns helpers for the test file.
 */
export async function startDb(resources = []) {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(repl.getUri('crypt-test'));
  const registry = createRegistry(resources);
  // Make sure indexes (unique etc.) exist before tests run, and collections exist for transactions.
  await Promise.all([User, ...resources.map((r) => r.model)].map(async (m) => { await m.createCollection().catch(() => {}); await m.syncIndexes(); }));
  await mongoose.model('ActivityLog').createCollection().catch(() => {});
  const ctx = useTestContext({ registry });

  return {
    ctx,
    registry,
    async stop() {
      await mongoose.disconnect();
      await repl.stop();
    },
    async clear() {
      const cols = await mongoose.connection.db.collections();
      await Promise.all(cols.map((c) => c.deleteMany({})));
    },
  };
}

/** Creates a user and returns the `req.user`-shaped actor. */
export async function makeActor(role = 'Member', name = 'Tester') {
  const u = await User.create({ name, email: `${name.toLowerCase()}-${new mongoose.Types.ObjectId()}@t.test`, role, passwordHash: 'x' });
  return { userId: String(u._id), role, name };
}
