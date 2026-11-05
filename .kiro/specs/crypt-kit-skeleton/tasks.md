# Implementation Plan: Crypt Kit Skeleton

## Overview

Build the `/skeleton` app, which Lab Ledger and Pantry Ghost are later copied from. The work is ordered so that each epic builds on the previous one:
1. server foundation and error handling, with the prototype's `err.status` bug fixed first
2. auth
3. the core resource engine (pure functions first, so property tests can lock them down)
4. the generic API
5. the cross-cutting features: activity, meta, dashboard, sweeper, reports and voice
6. the client
7. the summon script

## Tasks

- [x] 1. Set up skeleton server foundation
  - [x] 1.1 Scaffold `skeleton/server` (`package.json` with `"type": "module"`, scripts `dev`, `start`, `seed`, `test`; `.env.example`; `uploads/reports/.gitkeep`)
    - Dependencies per design "Key Dependencies"
    - _Requirements: 1.1_

  - [x] 1.2 Create `crypt.config.js` with `appName: 'Crypt Kit'`, `roles: ['Admin', 'Member', 'Viewer']`, `theme: 'crypt'` and three `demoUsers`
    - _Requirements: 2.1_

  - [x] 1.3 Implement `src/config/env.js` (validated, frozen) and `src/config/db.js` (memory replica set in DEMO_MODE)
    - Fail fast with a message naming the missing or short variable
    - Derive `VOICE_PROVIDER` default from `OPENAI_API_KEY`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x]* 1.4 Write unit tests for `env.js` validation branches
    - _Requirements: 2.3, 2.4, 2.6_

  - [x] 1.5 Implement `utils/asyncHandler.js`, `utils/httpError.js`, `middleware/errorHandler.js`, the API 404 handler and `GET /api/health`; create `createApp()` in `app.js`
    - Error handler honours `err.status` (design § Error Handling)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 15.1_

  - [x]* 1.6 Write property test for the error handler (Property 11)
    - **Property 11: Error Handler Honours Status Codes and Never Leaks Internals**
    - **Validates: Requirements 12.2, 12.4**

- [x] 2. Implement authentication and users
  - [x] 2.1 Create the `User` model with roles from config, `passwordHash` `select: false`, and `active`
    - _Requirements: 3.6_

  - [x] 2.2 Implement `authService` (`login`, `getMe`) and `userService` (`list`, `create`, `update`)
    - bcrypt cost ≥ 10; same 401 message for unknown email and wrong password; inactive users get 401
    - 409 for a duplicate email, 400 for an unknown role
    - _Requirements: 3.1, 3.2, 3.7, 3.8, 3.9_

  - [x] 2.3 Implement the `authenticate`, `requireRole` and `requirePermission` middleware
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 2.4 Wire the auth and users controllers and routes (`/api/auth/login`, `/api/auth/me`, `/api/users`)
    - _Requirements: 3.1, 3.8, 3.10_

  - [x]* 2.5 Write property test for JWT claims (Property 1)
    - **Property 1: JWT Contains Correct Claims for Any Valid User**
    - **Validates: Requirements 3.1**

  - [x]* 2.6 Write property test for unauthenticated rejection (Property 4)
    - **Property 4: Requests Without a Valid JWT Are Rejected**
    - **Validates: Requirements 3.3**

- [x] 3. Checkpoint: foundation and auth
  - Ensure all tests pass and `GET /api/health` responds in DEMO_MODE; ask the user if questions arise.

- [x] 4. Build the core resource engine (pure functions first)
  - [x] 4.1 Implement `core/fieldTypes.js` and `core/defineResource.js` (`validateDefinition`, `buildSchema`, `defineResource`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x]* 4.2 Write property test for definition validation (Property 2)
    - **Property 2: Invalid Resource Definitions Are Always Rejected**
    - **Validates: Requirements 4.3, 4.4**

  - [x] 4.3 Implement `core/permissions.js` (`can`) and `core/statusFlow.js` (`canTransition`)
    - _Requirements: 3.4, 3.5, 5.8_

  - [x]* 4.4 Write property test for the permission matrix (Property 3)
    - **Property 3: Permission Matrix Is Enforced for Every Role × Action**
    - **Validates: Requirements 3.4, 3.5, 5.1**

  - [x] 4.5 Implement `core/registry.js` (`loadResources`, `get`, `all`, `withDue`, duplicate-key check) and the example `resources/notes.js`
    - _Requirements: 4.5_

- [x] 5. Build the generic resource API and activity log
  - [x] 5.1 Implement `utils/pagination.js`, `utils/escapeRegex.js`, `utils/diff.js`, plus `sanitize` and `buildFilter` in `services/resourceService.js`
    - Cast filter values by field type; reject operator objects
    - _Requirements: 5.3, 5.4_

  - [x]* 5.2 Write property test for sanitize (Property 5)
    - **Property 5: Sanitize Never Stores Undeclared or System Fields**
    - **Validates: Requirements 5.4**

  - [x] 5.3 Create the `ActivityLog` model and `activityService` (`record`, `recordMany`, `forRecord`, `latest`)
    - _Requirements: 6.1, 6.4_

  - [x] 5.4 Implement `resourceService(resource)`: `list`, `get`, `create`, `update` (status flow check, diff), `remove` (soft or hard)
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 6.1_

  - [x] 5.5 Implement the `resolveResource` middleware, `resourceController` and `routes/resources.js`, plus the activity routes
    - _Requirements: 5.1, 5.2, 5.9, 6.2, 6.3_

  - [x]* 5.6 Write property test for the create–read round trip (Property 6)
    - **Property 6: Create–Read Round Trip Preserves Declared Fields**
    - **Validates: Requirements 4.6, 5.4, 5.5**

  - [x]* 5.7 Write property test for filters (Property 7)
    - **Property 7: Filters Return Exactly the Matching Records**
    - **Validates: Requirements 5.3, 5.6**

  - [x]* 5.8 Write property test for pagination (Property 8)
    - **Property 8: Pagination Partitions the Result Set**
    - **Validates: Requirements 5.3**

  - [x]* 5.9 Write property test for status transitions (Property 9)
    - **Property 9: Status Transitions Follow the Flow Exactly**
    - **Validates: Requirements 5.8**

  - [x]* 5.10 Write property test for the activity log (Property 10)
    - **Property 10: Every Mutation Produces Exactly One Activity Entry**
    - **Validates: Requirements 6.1**

- [x] 6. Implement meta and dashboard
  - [x] 6.1 Implement `/api/meta/public` and `/api/meta` (filter by read permission; strip secret/hidden fields)
    - _Requirements: 7.1, 7.2, 7.3_

  - [x]* 6.2 Write property test for meta exposure (Property 13)
    - **Property 13: Meta Never Exposes Secret, Hidden or Unreadable Data**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 6.3 Implement `dashboardService` (aggregation per readable resource) and its route
    - _Requirements: 9.1, 9.2_

  - [x] 6.4 Implement the extension points: resource `hooks` (in-transaction), `enum` + `multiple`, `statusFlow.workflowOnly`, `extendSchema`, and loaders for `routes/app`, `jobs/app` and `dashboard/`
    - _Requirements: 16.1, 16.2, 16.3, 16.5, 16.7, 16.8_

  - [x]* 6.5 Write property tests for hook rollback and workflow-only states (Properties 18, 19)
    - **Property 18: Hook Failures Roll Back the Whole Mutation**
    - **Property 19: Workflow-Only States Are Unreachable Through Generic PATCH**
    - **Validates: Requirements 16.1, 16.3**

- [x] 7. Checkpoint: generic API
  - Ensure all property tests pass; exercise the `notes` CRUD with curl or the Playwright MCP; ask the user if questions arise.

- [x] 8. Implement the overdue sweeper
  - [x] 8.1 Implement `sweeperService.sweep(registry, now)` and `jobs/index.js` (run at boot and every 15 minutes)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 8.2 Write property test for the sweeper (Property 12)
    - **Property 12: Overdue Sweeper Changes Exactly the Eligible Records**
    - **Validates: Requirements 8.2, 8.3**

- [x] 9. Implement PDF reports
  - [x] 9.1 Create the `Report` model and `utils/pdfGenerator.js` (header band, meta block, paginated table, footer)
    - _Requirements: 10.2, 10.3_

  - [x] 9.2 Implement `reportService` (`generate`, `createReport` with a custom `render`, `list`, `download` with 410 when the file is missing) and its routes
    - _Requirements: 10.1, 10.4, 10.5, 16.6_

  - [x]* 9.3 Write property test for report count (Property 16)
    - **Property 16: Report Rows Match the Filtered Listing**
    - **Validates: Requirements 10.1**

- [x] 10. Implement the voice agent backend
  - [x] 10.1 Implement `core/intentRegistry.js` (`parseIntent`, `build`) and `core/builtinIntents.js`
    - _Requirements: 11.1, 11.2, 11.3_

  - [x]* 10.2 Write property test for intent parsing (Property 14)
    - **Property 14: Intent Parser Recognises Every Generated Example**
    - **Validates: Requirements 11.1, 11.3**

  - [x] 10.3 Implement `speechService` (lazy OpenAI client; 502 on failure) and `voiceService.answer` (permission check, `aggregateOnly` exception)
    - _Requirements: 11.5, 11.6, 11.9, 16.4_

  - [x]* 10.4 Write property test for voice permission (Property 17)
    - **Property 17: Voice Answers Respect Read Permissions**
    - **Validates: Requirements 11.9**

  - [x] 10.5 Wire `upload.js` and the `/api/voice/ask`, `/api/voice/query` and `/api/voice/examples` routes
    - _Requirements: 11.4, 11.5, 11.10_

- [x] 11. Implement demo mode and seed
  - [x] 11.1 Implement `seed/index.js` (idempotent demo users per role plus demo records per resource); wire it into boot and `npm run seed`
    - _Requirements: 2.5, 15.2_

  - [x]* 11.2 Write integration test: login → create note → transition → activity → report download (supertest + memory DB)
    - _Requirements: 3.1, 5.1, 5.8, 6.2, 10.4_

- [x] 12. Checkpoint: backend complete
  - Ensure all backend tests pass with no `OPENAI_API_KEY` set; ask the user if questions arise.

- [x] 13. Build the client foundation
  - [x] 13.1 Scaffold `skeleton/client` (Vite, React, Tailwind, shadcn/ui init, React Router, React Query, axios, react-hook-form, recharts, react-hot-toast, lucide-react); add a Vite proxy for `/api`
    - _Requirements: 1.1_

  - [x] 13.2 Create `theme/tokens.css` (Crypt dark plus light variant), `ThemeToggle`, and reduced-motion handling
    - Verify AA contrast for every text/background token pair in both themes
    - _Requirements: 13.9, 14.1, 14.2, 14.3_

  - [x] 13.3 Implement `AuthContext`, `MetaContext`, `useApi` (401/403 interceptors), `lib/can.js` and `usePermission`
    - _Requirements: 3.3, 13.6_

  - [x]* 13.4 Write property test that client `can` mirrors server `can` (Property 15)
    - **Property 15: Client `can()` Mirrors Server `can()`**
    - **Validates: Requirements 13.6**

  - [x] 13.5 Implement `ProtectedRoute`, `AppShell`, `Sidebar` (meta-driven plus `appRoutes`) and `Topbar`; collapse to a sheet below `md`
    - _Requirements: 13.1, 13.2, 13.8_

- [x] 14. Build the client pages
  - [x] 14.1 Implement `Login.jsx`, including one-click demo sign-in buttons in DEMO_MODE
    - _Requirements: 3.1, 15.3_

  - [x] 14.2 Implement `Dashboard.jsx` (cards, enum charts, attention list, activity feed, skeleton loading)
    - _Requirements: 9.3, 9.4_

  - [x] 14.3 Implement `ResourceTable`, `ResourceFilters`, `ResourceList.jsx` (search, filters, pagination, permission-gated Create)
    - _Requirements: 13.3, 13.6_

  - [x] 14.4 Implement `FieldInput`, `RefSelect`, `ResourceForm`, `ResourceCreate.jsx` (inline server field errors, toasts)
    - _Requirements: 13.4, 13.7_

  - [x] 14.5 Implement `ResourceDetail.jsx` with `StatusBadge`, `StatusActions`, Edit/Delete and `ActivityTimeline`
    - _Requirements: 13.5, 13.6, 13.7_

  - [x] 14.6 Implement `Reports.jsx` (generate form: resource, filters, title; list; download)
    - _Requirements: 10.1, 10.4_

  - [x] 14.7 Implement `useRecorder`, `useSpeech`, `GhostOrb` and `VoiceAgent.jsx` (openai, browser and text fallbacks; example chips; per-intent renderers from `src/voice/`), plus app dashboard panel rendering from `src/dashboard/`
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.8, 11.10, 16.7, 16.9_

  - [x] 14.8 Implement `Users.jsx` (Superuser: list, create, change role, deactivate)
    - _Requirements: 3.8_

  - [x]* 14.9 Write client tests: ProtectedRoute redirect, Viewer hides mutation controls, voice page states
    - _Requirements: 13.1, 13.6, 11.10_

- [x] 15. Checkpoint: frontend complete
  - Verify 375px and 1440px layouts with the Playwright MCP; verify both themes; ask the user if questions arise.

- [x] 16. Summon script and docs
  - [x] 16.1 Implement `scripts/summon.js` (copy with exclusions, set `appName`, refuse an existing target)
    - _Requirements: 1.3, 1.4_

  - [x]* 16.2 Write smoke test for summon (temp dir; expected files; non-zero exit on an existing target)
    - _Requirements: 1.3, 1.4_

  - [x] 16.3 Write `skeleton/README.md` (setup, env, demo creds, how to add a resource or intent, deploy to Render + MongoDB Atlas)
    - _Requirements: 15.4_

  - [x] 16.4 Verify the root `package.json` scripts work, `LICENSE` is detected by GitHub, and `/.kiro` is committed (not git-ignored)
    - _Requirements: 1.2, 1.5_

- [x] 17. Final checkpoint: skeleton ready to summon
  - Ensure all tests pass, then run `npm run summon -- lab-ledger` and `npm run summon -- pantry-ghost` to start the app specs; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. **For this hackathon, keep the property tests.** They are a judged Kiro feature (PBT), and the write-up should cite any counterexamples they find.
- Each task references specific requirements for traceability. The `spec-trace` hook audits this.
- Core files (`core/`, `middleware/`, `components/resource/`, `lib/can.js`) must not diverge between apps. The `sync-core` hook copies them.
- The voice agent works without `OPENAI_API_KEY` through the browser provider. Tests must never need the key.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.5"] },
    { "id": 2, "tasks": ["1.4", "1.6", "2.1", "4.1", "4.3"] },
    { "id": 3, "tasks": ["2.2", "2.3", "4.2", "4.4", "4.5"] },
    { "id": 4, "tasks": ["2.4", "5.1", "5.3"] },
    { "id": 5, "tasks": ["2.5", "2.6", "5.2", "5.4"] },
    { "id": 6, "tasks": ["5.5", "6.4", "8.1", "9.1", "10.1"] },
    { "id": 7, "tasks": ["5.6", "5.7", "5.8", "5.9", "5.10", "6.1", "6.3", "6.5", "8.2", "9.2", "10.2", "10.3"] },
    { "id": 8, "tasks": ["6.2", "9.3", "10.4", "10.5", "11.1"] },
    { "id": 9, "tasks": ["11.2", "13.1"] },
    { "id": 10, "tasks": ["13.2", "13.3"] },
    { "id": 11, "tasks": ["13.4", "13.5"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.6", "14.7", "14.8"] },
    { "id": 13, "tasks": ["14.5", "14.9", "16.1"] },
    { "id": 14, "tasks": ["16.2", "16.3", "16.4"] }
  ]
}
```
