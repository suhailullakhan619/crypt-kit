/**
 * Demo records for the `time-entries` resource. Default-exports `{ resource, records(ctx) }`; ctx = { users, now, pick }.
 */
const DAY = 86400000;
const HOUR = 3600000;
export default {
  resource: 'time-entries',
  records: ({ users, now, pick }) => {
    const member = users.byRole.Member ?? users.all[0];
    const admin = users.byRole.Admin ?? users.all[0];
    const ago = (days) => new Date(now.getTime() - days * DAY);
    return [
      { what: 'Counted eye-of-newt jars', minutes: 45, day: ago(0), task: pick('notes', 0), person: member },
      { what: 'Phoned the supplier', minutes: 15, day: ago(0), task: pick('notes', 0), person: member },
      { what: 'Polished the crystal ball', minutes: 30, day: ago(1), task: pick('notes', 1), person: member },
      { what: 'Filled in the insurance forms', minutes: 50, day: ago(2), task: pick('notes', 2), person: admin },
      { what: 'Rehearsed the third spirit', minutes: 90, day: ago(3), task: pick('notes', 3), person: member },
      { what: 'Sanded the creaky stair (a little)', minutes: 25, day: ago(5), task: pick('notes', 4), person: admin },
      { what: 'Weekly planning', minutes: 40, day: ago(6), person: admin },
      { what: 'Sorted bottles by colour', minutes: 60, day: ago(8), task: pick('notes', 5), person: member },
    ];
  },
};
