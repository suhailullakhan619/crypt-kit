/**
 * Two Jest projects:
 *
 * - "core": the skeleton's own suites, byte-identical to /skeleton. They assert skeleton
 *   defaults (app name "Crypt Kit", roles Admin/Member/Viewer), so `crypt.config.js` is mapped
 *   to test/skeleton.crypt.config.js — the same Core code is exercised against the reference config.
 * - "app": Lab Ledger suites, run against the real crypt.config.js (LabManager/Technician/Student).
 */
const SKELETON_SUITES = [
  'src/config/env.test.js',
  'src/core/defineResource.property.test.js',
  'src/core/intentRegistry.property.test.js',
  'src/core/permissions.property.test.js',
  'src/middleware/auth.property.test.js',
  'src/middleware/errorHandler.property.test.js',
  'src/routes/voice.test.js',
  'src/services/authService.property.test.js',
  'src/services/extensionPoints.property.test.js',
  'src/services/metaService.property.test.js',
  'src/services/reportService.property.test.js',
  'src/services/resourceService.db.property.test.js',
  'src/services/resourceService.sanitize.property.test.js',
  'src/services/sweeperService.property.test.js',
  'src/services/voiceService.property.test.js',
  'src/utils/pdfGenerator.test.js',
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\/]/g, '\$&');
const common = { testEnvironment: 'node', transform: {} };

export default {
  testTimeout: 60000,
  projects: [
    {
      ...common,
      displayName: 'core',
      testMatch: SKELETON_SUITES.map((f) => `<rootDir>/${f}`),
      moduleNameMapper: {
        '^(\\.{1,2}/)+crypt\\.config\\.js$': '<rootDir>/test/skeleton.crypt.config.js',
        // The skeleton's example resource is deleted in Lab Ledger; Core suites get the fixture copy.
        '^\\.\\./resources/notes\\.js$': '<rootDir>/test/fixtures/notes.js',
        // App routers import the Lab resources (LabManager/Technician/Student permissions), which are
        // invalid under the reference roles; the skeleton has no app routes, so neither do its suites.
        '[\\\\/]routes[\\\\/]app[\\\\/][^\\\\/]+\\.js$': '<rootDir>/test/stubs/emptyAppRouter.js',
      },
    },
    {
      ...common,
      displayName: 'app',
      testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/test/**/*.test.js'],
      testPathIgnorePatterns: ['/node_modules/', ...SKELETON_SUITES.map((f) => escape(f))],
    },
  ],
};
