/**
 * Two Jest projects (skeleton Req 16.15). This file is Core: apps raised with `npm run summon`
 * keep it unchanged, and `scripts/check-core.js` verifies that.
 *
 * - "core": the skeleton's own suites. `crypt.config.js` is mapped to the frozen reference
 *   config in test/core/, the example `notes` resource to a fixture copy, and app routers to an
 *   empty router. Core is therefore always tested against the same roles, whatever the app
 *   configures.
 * - "app": every other suite (app domain tests, integration, property tests), run against the
 *   app's real crypt.config.js.
 */
export const CORE_SUITES = [
  'src/config/env.test.js',
  'src/app.test.js',
  'src/core/defineResource.property.test.js',
  'src/core/intentRegistry.property.test.js',
  'src/core/permissions.property.test.js',
  'src/middleware/auth.property.test.js',
  'src/middleware/errorHandler.property.test.js',
  'src/middleware/rateLimit.test.js',
  'src/services/checklist.test.js',
  'src/services/comments.test.js',
  'src/services/search.test.js',
  'src/services/dateRange.test.js',
  'src/services/assistant.test.js',
  'src/services/speech.test.js',
  'src/core/queryParser.test.js',
  'src/core/when.test.js',
  'src/services/sortCollation.test.js',
  'src/services/csvExport.test.js',
  'src/services/csvImport.test.js',
  'src/services/notifications.test.js',
  'src/services/changePassword.test.js',
  'src/services/openapi.test.js',
  'src/services/mail.test.js',
  'src/routes/voice.test.js',
  'src/routes/genericDisabled.property.test.js',
  'src/services/authService.property.test.js',
  'src/services/deleteHooks.property.test.js',
  'src/services/extensionPoints.property.test.js',
  'src/services/metaService.property.test.js',
  'src/services/reportService.property.test.js',
  'src/services/resourceService.db.property.test.js',
  'src/services/resourceService.sanitize.property.test.js',
  'src/services/sweeperService.property.test.js',
  'src/services/voiceService.property.test.js',
  'src/utils/pdfGenerator.test.js',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Match either path separator so the ignore list also works on Windows.
const pathRe = (p) => p.split('/').map(escapeRe).join('[\\\\/]');
const common = { testEnvironment: 'node', transform: {} };

export default {
  testTimeout: 60000,
  projects: [
    {
      ...common,
      displayName: 'core',
      testMatch: CORE_SUITES.map((f) => `<rootDir>/${f}`),
      moduleNameMapper: {
        '^(\\.{1,2}/)+crypt\\.config\\.js$': '<rootDir>/test/core/crypt.config.js',
        '^\\.\\./resources/notes\\.js$': '<rootDir>/test/core/notes.js',
        '[\\\\/]routes[\\\\/]app[\\\\/][^\\\\/]+\\.js$': '<rootDir>/test/core/emptyAppRouter.js',
      },
    },
    {
      ...common,
      displayName: 'app',
      testMatch: ['<rootDir>/src/**/*.test.js', '<rootDir>/test/**/*.test.js'],
      testPathIgnorePatterns: [pathRe('/node_modules/'), pathRe('/test/core/'), ...CORE_SUITES.map(pathRe)],
    },
  ],
};
