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
  // Extra roles (besides the LabManager) told when a due rule flags a record, per resource key.
  // Resources whose due rule is routine bookkeeping: no notifications and no overdue badge on the dashboard.
  routineDueRules: ['reservations'],
  notifyRoles: { equipment: ['Technician'], checkouts: ['Technician'] },
  // PDF reports: shown in the report header; dates are printed in this IANA time zone.
  reports: {
    organization: 'Crypt Kit University — Science Labs',
    timeZone: 'UTC',
    // PDF colours: the light palette of client/src/theme/tokens.css (Mad Lab theme), so reports match
    // the portal. pdfTheme.test.js fails if these drift from tokens.css.
    theme: {
      primary: '#107535',
      primaryForeground: '#ffffff',
      ink: '#141a29',
      muted: '#515767',
      border: '#d1dbd8',
      zebra: '#e5ebe9',
    },
  },
  demoUsers: [
    { name: 'Marie Manager', email: 'manager@lab.test', password: 'lab-manager-demo', role: 'LabManager' },
    { name: 'Tomas Technician', email: 'tech@lab.test', password: 'lab-tech-demo', role: 'Technician' },
    { name: 'Priya Student', email: 'student@lab.test', password: 'lab-student-demo', role: 'Student' },
  ],
};

export default config;
