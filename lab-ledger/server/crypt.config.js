/**
 * Lab Ledger configuration.
 *
 * - `roles` are ordered from highest to lowest privilege. The FIRST role (LabManager) is the
 *   Superuser: it may perform every action on every resource and manage users.
 * - `demoUsers` are created by the seed (and shown on the login page) only in DEMO_MODE.
 */
const config = {
  appName: 'Lab Ledger',
  roles: ['LabManager', 'Technician', 'Student'],
  theme: 'mad-lab',
  // PDF reports: shown in the report header; dates are printed in this IANA time zone.
  reports: {
    organization: 'Crypt Kit University — Science Labs',
    timeZone: 'UTC',
  },
  demoUsers: [
    { name: 'Marie Manager', email: 'manager@lab.test', password: 'lab-manager-demo', role: 'LabManager' },
    { name: 'Tomas Technician', email: 'tech@lab.test', password: 'lab-tech-demo', role: 'Technician' },
    { name: 'Priya Student', email: 'student@lab.test', password: 'lab-student-demo', role: 'Student' },
  ],
};

export default config;
