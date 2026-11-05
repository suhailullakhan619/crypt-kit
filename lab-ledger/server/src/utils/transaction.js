import mongoose from 'mongoose';

/**
 * Runs `fn(session)` inside a MongoDB transaction and returns its result.
 * Any throw aborts the transaction (used for hooks rollback — Property 18).
 * @template T
 * @param {(session: mongoose.ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
