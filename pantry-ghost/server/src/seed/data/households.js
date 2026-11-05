import { buildPantry } from '../pantry.seed.js';

/** 45 demo households: code, size and dietary flags only (Req 2.4, 7.4). */
export default {
  resource: 'households',
  records: ({ now }) => buildPantry(now).households,
};
