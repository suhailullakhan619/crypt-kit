import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cache the mongod binary inside this package so it is reused whatever the working directory.
const BINARY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../node_modules/.cache/mongodb-memory-server');

let memoryServer = null;

/**
 * Connects Mongoose. In DEMO_MODE (no MONGODB_URI) starts an in-memory single-node
 * replica set first, so multi-document transactions work exactly as in production.
 *
 * @param {{ MONGODB_URI: string|null, DEMO_MODE: boolean }} env
 * @returns {Promise<string>} the URI that was connected to (credentials redacted)
 */
export async function connectDB(env) {
  let uri = env.MONGODB_URI;

  if (!uri) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: { downloadDir: process.env.MONGOMS_DOWNLOAD_DIR ?? BINARY_DIR },
    });
    uri = memoryServer.getUri('crypt-kit');
  }

  await mongoose.connect(uri);
  return uri.replace(/\/\/[^@/]+@/, '//***@');
}

/** Disconnects Mongoose and stops the in-memory server if one was started. */
export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
