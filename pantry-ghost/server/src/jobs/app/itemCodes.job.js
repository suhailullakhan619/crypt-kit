import { backfillCodes } from '../../utils/itemCode.js';

/**
 * At boot and hourly: gives a short item ID (SL-0001) to stock lots that have none, e.g. lots seeded
 * or saved before IDs existed. New lots get theirs when created (intake, the form, CSV import).
 */
export default {
  name: 'item-codes',
  schedule: '15 * * * *',
  runAtBoot: true,
  run: async ({ registry }) => {
    const lots = registry?.get('stock-lots');
    return lots ? { 'stock-lots': await backfillCodes(lots.model, 'code', 'SL') } : {};
  },
};
