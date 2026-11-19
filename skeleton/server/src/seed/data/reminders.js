/**
 * Demo records for the `reminders` resource. Default-exports `{ resource, records(ctx) }`; ctx = { users, now, pick }.
 */
const DAY = 86400000;
const HOUR = 3600000;
export default {
  resource: 'reminders',
  records: ({ users, now, pick }) => {
    const member = users.byRole.Member ?? users.all[0];
    const admin = users.byRole.Admin ?? users.all[0];
    const inHours = (h) => new Date(now.getTime() + h * HOUR);
    return [
      { title: 'Call the broom insurer', remindAt: inHours(3), status: 'Pending', owner: member, details: 'Ask about the renewal discount.', note: pick('notes', 2) },
      { title: 'Full-moon ritual prep', remindAt: inHours(30), status: 'Pending', owner: member },
      { title: 'Feed the gargoyle', remindAt: inHours(52), status: 'Pending', owner: admin },
      { title: 'Renew the crypt lease', remindAt: inHours(-20), status: 'Pending', owner: admin, details: 'Overdue on purpose: the sweeper marks it Missed.' },
      { title: 'Water the mandrake', remindAt: inHours(-6), status: 'Done', owner: member },
    ];
  },
};
