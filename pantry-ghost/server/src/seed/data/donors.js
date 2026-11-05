import { buildPantry } from '../pantry.seed.js';

/** 12 demo donors (Req 7.4). */
export default {
  resource: 'donors',
  records: ({ now }) => buildPantry(now).donors,
};
