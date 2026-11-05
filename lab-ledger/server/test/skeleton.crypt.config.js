// Reference skeleton config (copied verbatim from skeleton/server/crypt.config.js).
// The "core" Jest project maps crypt.config.js to this file so the skeleton suites run unchanged.
/**
 * Crypt Kit app configuration.
 *
 * - `roles` are ordered from highest to lowest privilege. The FIRST role is the
 *   Superuser: it may perform every action on every resource and manage users.
 * - `demoUsers` are created by the seed (and shown on the login page) only in DEMO_MODE.
 */
const config = {
  appName: 'Crypt Kit',
  roles: ['Admin', 'Member', 'Viewer'],
  theme: 'crypt',
  // PDF reports: shown in the report header; dates are printed in this IANA time zone.
  reports: {
    organization: 'Crypt Kit Demo Coven',
    timeZone: 'UTC',
  },
  demoUsers: [
    { name: 'Morticia Admin', email: 'admin@crypt.test', password: 'crypt-admin-demo', role: 'Admin' },
    { name: 'Igor Member', email: 'member@crypt.test', password: 'crypt-member-demo', role: 'Member' },
    { name: 'Casper Viewer', email: 'viewer@crypt.test', password: 'crypt-viewer-demo', role: 'Viewer' },
  ],
};

export default config;
