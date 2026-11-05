import { buildPantry } from '../pantry.seed.js';

/** 120 demo lots with status, receivedQuantity and post-distribution quantities precomputed (Req 7.4). */
export default {
  resource: 'stock-lots',
  records: ({ now }) => buildPantry(now).lots,
};
