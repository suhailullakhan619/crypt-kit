/**
 * The skeleton's own crypt.config.js, used ONLY by the "skeleton" Jest project.
 *
 * The skeleton suites (core, middleware and generic services) hard-code the skeleton's role
 * names (Admin/Member/Viewer) in fixtures such as test/fixtures/specimens.js. They run here
 * unchanged against this config (Pantry Ghost task 1.3); the Pantry Ghost suites run against
 * the real crypt.config.js. See package.json → jest.projects.
 */
const config = {
  appName: 'Crypt Kit',
  roles: ['Admin', 'Member', 'Viewer'],
  theme: 'crypt',
  reports: { organization: 'Crypt Kit Demo Coven', timeZone: 'UTC' },
  demoUsers: [
    { name: 'Morticia Admin', email: 'admin@crypt.test', password: 'crypt-admin-demo', role: 'Admin' },
    { name: 'Igor Member', email: 'member@crypt.test', password: 'crypt-member-demo', role: 'Member' },
    { name: 'Casper Viewer', email: 'viewer@crypt.test', password: 'crypt-viewer-demo', role: 'Viewer' },
  ],
};

export default config;
