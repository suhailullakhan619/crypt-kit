/**
 * Pantry Ghost configuration.
 *
 * - `roles` are ordered from highest to lowest privilege. The FIRST role (Coordinator) is the
 *   Superuser: it may perform every action on every resource and manage users.
 * - Board is read-only and sees aggregates only — never household records (Req 2.3, 6.2).
 * - `demoUsers` are created by the seed (and shown on the login page) only in DEMO_MODE.
 */
const config = {
  appName: 'Pantry Ghost',
  roles: ['Coordinator', 'Volunteer', 'Board'],
  theme: 'lantern',
  // PDF reports: shown in the report header; dates are printed in this IANA time zone.
  reports: {
    organization: 'Crypt Kit Community Food Bank',
    timeZone: 'UTC',
  },
  demoUsers: [
    { name: 'Rosa Coordinator', email: 'coordinator@pantry.test', password: 'pantry-coordinator-demo', role: 'Coordinator' },
    { name: 'Sam Volunteer', email: 'volunteer@pantry.test', password: 'pantry-volunteer-demo', role: 'Volunteer' },
    { name: 'Ada Board', email: 'board@pantry.test', password: 'pantry-board-demo', role: 'Board' },
  ],
};

export default config;
