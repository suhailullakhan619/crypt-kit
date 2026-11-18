const DAY = 86400000;
const HOUR = 3600000;

/** Demo bookings: a few upcoming windows on different instruments, by the demo student and technician. */
export default {
  resource: 'reservations',
  records: ({ now, pick, users }) => [
    { equipment: pick('equipment', 4), user: users.byRole.Student, startAt: new Date(now.getTime() + 1 * DAY), endAt: new Date(now.getTime() + 1 * DAY + 3 * HOUR), status: 'Booked', purpose: 'Optics practical' },
    { equipment: pick('equipment', 5), user: users.byRole.Student, startAt: new Date(now.getTime() + 2 * DAY), endAt: new Date(now.getTime() + 2 * DAY + 2 * HOUR), status: 'Booked', purpose: 'Titration lab' },
    { equipment: pick('equipment', 4), user: users.byRole.Technician, startAt: new Date(now.getTime() + 3 * DAY), endAt: new Date(now.getTime() + 3 * DAY + 4 * HOUR), status: 'Booked', purpose: 'Maintenance check' },
    { equipment: pick('equipment', 6), user: users.byRole.Student, startAt: new Date(now.getTime() - 3 * DAY), endAt: new Date(now.getTime() - 3 * DAY + 2 * HOUR), status: 'Completed', purpose: 'Last week practical' },
  ],
};
