/**
 * Demo records for the `goals` resource. Default-exports `{ resource, records(ctx) }`; ctx = { users, now, pick }.
 */
const DAY = 86400000;
const HOUR = 3600000;
export default {
  resource: 'goals',
  records: ({ users, now }) => {
    const member = users.byRole.Member ?? users.all[0];
    const admin = users.byRole.Admin ?? users.all[0];
    const at = (days) => new Date(now.getTime() + days * DAY);
    return [
      { title: 'Master the séance script', why: 'The third spirit keeps forgetting their lines.', status: 'Active', owner: member, targetDate: at(30), progress: 50,
        milestones: [{ text: 'Write the lines', done: true }, { text: 'Rehearse twice', done: true }, { text: 'Dress rehearsal', done: false }, { text: 'Opening night', done: false }] },
      { title: 'Declutter the attic', status: 'Active', owner: admin, targetDate: at(-5), progress: 33,
        milestones: [{ text: 'Sort the boxes', done: true }, { text: 'Donate the spare skulls', done: false }, { text: 'Sweep', done: false }] },
      { title: 'Learn three new potions', status: 'Achieved', owner: member, targetDate: at(-12), progress: 100,
        milestones: [{ text: 'Invisibility', done: true }, { text: 'Night vision', done: true }, { text: 'Gentle sleep', done: true }] },
    ];
  },
};
