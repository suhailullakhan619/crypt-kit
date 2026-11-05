import { buildPantry } from '../pantry.seed.js';

/** 150 demo FEFO distributions, packed by the demo Volunteer and Coordinator (Req 7.4). */
export default {
  resource: 'distributions',
  records: ({ now, users }) =>
    buildPantry(now).distributions.map((d, i) => ({
      ...d,
      volunteer: (i % 3 === 0 ? users.byRole.Coordinator : users.byRole.Volunteer) ?? users.all[0],
    })),
};
