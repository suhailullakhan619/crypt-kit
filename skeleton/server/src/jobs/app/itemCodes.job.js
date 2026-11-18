import { backfillCodes } from '../../utils/itemCode.js';

/**
 * At boot and hourly: gives a short ID (N-0001) to notes that have none, e.g. seeded or imported
 * before IDs existed. New notes get theirs when created.
 */
export default {
  name: 'item-codes',
  schedule: '15 * * * *',
  runAtBoot: true,
  run: async ({ registry }) => {
    const notes = registry?.get('notes');
    return notes ? { notes: await backfillCodes(notes.model, 'code', 'N') } : {};
  },
};
