# Requirements Document

> **Change note (Kiroween 2026, voice):** the Amazon Bedrock assistant and the OpenAI voice provider were removed. Chat answers come from the built-in rule-based query engine only. Spoken answers use Amazon Polly (`VOICE_PROVIDER=polly`, `POST /api/voice/speak`) with an automatic fallback to the browser voice. Requirements below that mention Bedrock or OpenAI describe the earlier design.


## Introduction

Crypt Kit is a lean, reusable full-stack skeleton for internal tools. It lives in `/skeleton` and has a React client (`/skeleton/client`) and an Express.js server (`/skeleton/server`) backed by MongoDB.

Developers describe their domain as declarative **Resource Definitions**: fields, roles, status flow, due dates, report columns and voice synonyms. From these definitions the skeleton provides:
- JWT authentication with configurable roles
- a generic CRUD API with pagination, filters, search and soft delete
- auto-generated list, detail and form screens
- an activity log, a dashboard and PDF reports
- a scheduled overdue sweeper
- a voice agent that answers spoken or typed questions about the data

Apps are raised from the skeleton by copying it (`npm run summon -- <name>`) and adding resource and intent files. Two apps, Lab Ledger and Pantry Ghost, have their own specs and prove the skeleton's versatility.

## Glossary

- **Skeleton**: The template application in `/skeleton`, containing the Core engine and no domain-specific resources beyond one example.
- **App**: A standalone copy of the Skeleton in its own top-level folder, extended with domain-specific resources, intents and pages.
- **Core**: The engine code in `server/src/core/`, the shared middleware, and the generic client components in `client/src/components/resource/`. Core must be identical across Skeleton and Apps.
- **Resource Definition**: A JavaScript object exported from a file in `server/src/resources/`, passed through `defineResource()`. It declares a domain entity's key, label, fields, permissions and optional behaviours.
- **Resource Key**: The lowercase kebab-case identifier of a resource (e.g. `equipment`). It is used in API paths (`/api/r/:key`) and client routes (`/r/:key`).
- **Field Spec**: The declaration of one field in a Resource Definition. It has a `type` (string, text, number, boolean, date, enum, ref), validation flags (`required`, `min`, `max`, `values`), and UI flags (`list`, `filter`, `search`, `hidden`, `secret`).
- **Role**: A named permission level. Roles are listed in `crypt.config.js` from highest to lowest privilege. The first role is the Superuser Role.
- **Superuser Role**: The first role in `crypt.config.js`. It may perform every action on every resource and manage users.
- **Action**: One of `read`, `create`, `update`, `delete`.
- **Permission Matrix**: The mapping of `(resource, action) → allowed roles` declared in each Resource Definition.
- **Status Flow**: An optional Resource Definition block naming an enum field and its allowed transitions.
- **Due Rule**: An optional Resource Definition block naming a date field, the statuses it applies to, and the status to set once the date has passed.
- **Overdue Sweeper**: The scheduled job that applies every Due Rule.
- **Activity Log**: An append-only collection recording each create, update, delete and status-change mutation.
- **Meta Endpoint**: `GET /api/meta`. It returns app name, roles, theme and public resource metadata so the client can render screens without hard-coded fields.
- **Intent**: A named voice/text query type with a matcher, a data handler and a response builder.
- **Intent Registry**: The ordered list of built-in and app-registered Intents.
- **Voice Provider**: The STT/TTS implementation. `openai` uses Whisper and TTS on the server. `browser` uses the Web Speech API on the client and the text endpoint on the server.
- **Demo Mode**: Runtime mode (`DEMO_MODE=true`) where the server starts an in-memory MongoDB and seeds demo users and data.

---

## Requirements

### Requirement 1: Repository and App Structure

**User Story:** As a developer, I want a skeleton folder and independent app folders in one repository, so that I can raise new apps from the same foundation and each app runs on its own.

#### Acceptance Criteria

1. THE Repository SHALL contain top-level folders `/skeleton`, `/lab-ledger` and `/pantry-ghost`, each containing its own `client/` and `server/` with their own `package.json`.
2. THE Repository SHALL contain a root `package.json` with scripts to install and run each app (`install:all`, `dev:skeleton`, `dev:lab`, `dev:pantry`, `test`, `summon`).
3. WHEN a developer runs `npm run summon -- <name>`, THE Summon Script SHALL copy `/skeleton` to `/<name>` excluding `node_modules`, `dist`, `.env` and generated reports, and set `appName` in the new `crypt.config.js` to `<name>`.
4. IF the target folder of the Summon Script already exists, THEN THE Summon Script SHALL exit with a non-zero code and leave the existing folder unchanged.
5. THE Repository SHALL contain an MIT `LICENSE` file and a committed `/.kiro` directory with specs, steering and hooks.

---

### Requirement 2: Configuration and Environment

**User Story:** As a developer, I want all app-level settings in one config file and validated environment variables, so that misconfiguration fails fast with a clear message.

#### Acceptance Criteria

1. THE Server SHALL read app settings from `server/crypt.config.js`, which exports `appName`, `roles` (ordered array of at least 2 unique PascalCase strings), `theme`, and `demoUsers`.
2. THE Server SHALL read environment variables only through `src/config/env.js`, which exports a frozen object with `PORT`, `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, `DEMO_MODE`, `OPENAI_API_KEY` and `VOICE_PROVIDER`.
3. IF `JWT_SECRET` is missing or shorter than 32 characters and `DEMO_MODE` is not `true`, THEN THE Server SHALL refuse to start and log a message naming the variable.
4. IF `MONGODB_URI` is missing and `DEMO_MODE` is not `true`, THEN THE Server SHALL refuse to start and log a message naming the variable.
5. WHEN `DEMO_MODE` is `true`, THE Server SHALL start an in-memory MongoDB replica set, generate a random JWT secret if none is set, and seed demo users and demo data before accepting requests.
6. THE Server SHALL default `VOICE_PROVIDER` to `openai` when `OPENAI_API_KEY` is set and to `browser` otherwise.

---

### Requirement 3: Authentication and Role-Based Access Control

**User Story:** As an administrator, I want JWT authentication with configurable roles, so that each app can model its own team while staying secure.

#### Acceptance Criteria

1. WHEN a user submits valid credentials to `POST /api/auth/login`, THE Auth Service SHALL return a JWT signed with `JWT_SECRET` containing `userId`, `role` and `name`, expiring in 24 hours, together with the user object without `passwordHash`.
2. IF credentials are invalid, THEN THE Auth Service SHALL return HTTP 401 with the same message whether the email or the password was wrong.
3. IF a request to a protected endpoint has no valid JWT, THEN THE API Server SHALL return HTTP 401.
4. IF an authenticated user's role is not in the Permission Matrix entry for the requested resource and action, THEN THE API Server SHALL return HTTP 403.
5. THE Superuser Role SHALL be permitted every action on every resource regardless of the Permission Matrix.
6. THE User Model SHALL include `name`, `email` (unique, lowercase), `passwordHash`, `role` (enum of configured roles), `active` (boolean, default true) and `createdAt`.
7. THE Auth Service SHALL hash passwords with bcrypt using a cost factor of at least 10.
8. WHEN a Superuser creates a user via `POST /api/users`, THE User Service SHALL reject duplicate emails with HTTP 409 and reject unknown roles with HTTP 400.
9. IF a user with `active: false` attempts to log in, THEN THE Auth Service SHALL return HTTP 401.
10. THE API Server SHALL provide `GET /api/auth/me`, returning the current user without `passwordHash`.

---

### Requirement 4: Resource Definitions

**User Story:** As a developer, I want to declare a domain entity in a single file, so that I get a database model, API and UI without writing boilerplate.

#### Acceptance Criteria

1. THE Core SHALL export `defineResource(definition)`. It validates the definition and returns a frozen Resource object containing the definition and a Mongoose model.
2. THE Resource Definition SHALL support: `key`, `label`, `icon`, `fields`, `permissions` (per Action), optional `titleField`, `softDelete`, `statusFlow`, `due`, `report`, `voice`, `defaultSort`.
3. IF a Resource Definition has an invalid `key`, a field with an unknown `type`, an `enum` field without `values`, a `ref` field without a `ref` target, or a permission naming a role not in `crypt.config.js`, THEN `defineResource` SHALL throw an error naming the resource and the offending property.
4. IF a `statusFlow` or `due` block references a field that is not an `enum` field in the same definition, or a status value not in that field's `values`, THEN `defineResource` SHALL throw an error naming the resource and the value.
5. WHEN the Server starts, THE Registry SHALL load every file in `server/src/resources/` and register each Resource. IF two Resources share a key, THEN THE Registry SHALL throw an error and the Server SHALL not start.
6. THE generated Mongoose model SHALL enforce `required`, `min`, `max`, `values`, `unique` and `ref` from Field Specs, and SHALL add `createdBy`, `createdAt` and `updatedAt` automatically.
7. WHERE a Field Spec has `secret: true`, THE generated model SHALL exclude that field from query results by default (`select: false`).

---

### Requirement 5: Generic Resource API

**User Story:** As a user, I want consistent create, read, update and delete endpoints for every resource, so that every app behaves predictably.

#### Acceptance Criteria

1. THE API Server SHALL expose, for every registered Resource, `GET /api/r/:key`, `POST /api/r/:key`, `GET /api/r/:key/:id`, `PATCH /api/r/:key/:id` and `DELETE /api/r/:key/:id`, each guarded by the Permission Matrix for the matching Action.
2. IF `:key` does not match a registered Resource, THEN THE API Server SHALL return HTTP 404.
3. WHEN listing, THE Resource Service SHALL return `{ items, total, page, pages }` with `page` default 1 and `limit` default 20 (maximum 100). It SHALL support equality filters on fields with `filter: true`, a case-insensitive `q` search across fields with `search: true`, and `sort` on any non-secret field.
4. WHEN creating or updating, THE Resource Service SHALL remove fields not declared in the definition, remove `createdBy`/`createdAt`/`updatedAt` from input, and set `createdBy` to the authenticated user on create.
5. WHEN fetching a single record, THE Resource Service SHALL populate all `ref` fields with `name` and `_id` only, and SHALL return HTTP 404 if the record does not exist or the id is malformed.
6. WHERE a Resource has `softDelete`, WHEN a record is deleted, THE Resource Service SHALL set the configured status field to the configured value and set the configured timestamp field instead of removing the document. List responses SHALL exclude soft-deleted records unless `includeDeleted=true` is passed by a Superuser.
7. WHERE a Resource has no `softDelete`, WHEN a record is deleted, THE Resource Service SHALL remove the document and return HTTP 204.
8. WHERE a Resource has a `statusFlow`, IF an update changes the status field to a value not allowed from the current value, THEN THE Resource Service SHALL return HTTP 409 with a message naming both values.
9. IF Mongoose validation fails, THEN THE API Server SHALL return HTTP 400 with a `fields` object mapping each invalid field to its message.

---

### Requirement 6: Activity Log

**User Story:** As an administrator, I want every change recorded, so that I can see who did what and when.

#### Acceptance Criteria

1. WHEN a record is created, updated, deleted or changes status through the Resource Service or a domain service, THE Activity Service SHALL append exactly one Activity Log entry with `actor`, `resource`, `recordId`, `action` (`create|update|delete|status`), `diff` (changed fields only, excluding secret fields) and `at`.
2. THE API Server SHALL expose `GET /api/r/:key/:id/activity`, returning that record's entries newest first, guarded by the resource's `read` permission.
3. THE API Server SHALL expose `GET /api/activity`, returning the latest 50 entries across all resources, to the Superuser Role only.
4. THE Activity Log SHALL be append-only. No endpoint SHALL update or delete Activity Log entries.

---

### Requirement 7: Metadata Endpoint

**User Story:** As a frontend developer, I want the client to discover resources at runtime, so that adding a resource requires no client code.

#### Acceptance Criteria

1. THE API Server SHALL expose `GET /api/meta/public` (no auth), returning `appName` and `theme` only.
2. THE API Server SHALL expose `GET /api/meta` (auth required), returning `appName`, `theme`, `roles`, the current user's role, and for each Resource the user may `read`: `key`, `label`, `icon`, `titleField`, `fields` (excluding any field with `secret: true` or `hidden: true`), `permissions`, `statusFlow` and `due`.
3. THE Meta Endpoint SHALL never include a Resource the current user cannot `read`.

---

### Requirement 8: Overdue Sweeper

**User Story:** As a manager, I want records with past due dates flagged automatically, so that nothing is forgotten.

#### Acceptance Criteria

1. THE Server SHALL schedule the Overdue Sweeper every 15 minutes and run it once at startup.
2. WHEN the Overdue Sweeper runs, FOR each Resource with a `due` rule, THE Sweeper SHALL set the status field to `due.to` on every record whose date field is earlier than the current time and whose status is in `due.from`.
3. THE Overdue Sweeper SHALL not modify records whose date field is empty, in the future, or whose status is not in `due.from`.
4. WHEN the Overdue Sweeper changes a record, THE Activity Service SHALL record a `status` entry with actor `system`.
5. THE Overdue Sweeper SHALL accept an injected `now` so it can be tested deterministically.

---

### Requirement 9: Dashboard

**User Story:** As any user, I want an at-a-glance summary of my data, so that I know what needs attention.

#### Acceptance Criteria

1. THE API Server SHALL expose `GET /api/dashboard`, returning for each readable Resource: total count, counts grouped by each `enum` field with `filter: true`, the count of records currently in `due.to` status, and the count of records whose due date falls within the next 7 days.
2. THE API Server SHALL include the 10 most recent Activity Log entries visible to the user.
3. THE Client Dashboard SHALL display one summary card per Resource, one chart per Resource of its first enum breakdown, an "Attention" list of overdue and due-soon counts, and the recent activity feed.
4. WHILE dashboard data is loading, THE Client Dashboard SHALL display skeleton placeholders for each card.

---

### Requirement 10: PDF Reports

**User Story:** As a manager, I want to generate and download PDF reports, so that I can share audits and summaries with people who do not use the app.

#### Acceptance Criteria

1. WHEN a user with `read` permission on a Resource posts `{ resource, filters, title }` to `POST /api/reports`, THE Report Service SHALL query matching records (same filter rules as listing, no pagination, maximum 5,000), generate a PDF, save it under `server/uploads/reports/<uuid>.pdf`, persist a Report record, and return it with HTTP 201.
2. THE generated PDF SHALL use A4 landscape with: the report title (upper case) and a right-aligned "Generated on: DD-MM-YYYY HH:mm" in the configured time zone; a meta line "Organization | applied filters | Generated by | Total Records"; a bordered grid table with a navy header row repeated on every page, a "Sl No" column, wrapped cells and optional per-column links; and a footer "<APP NAME> - <TITLE>" with "Page x of y" on every page. Columns are `report.columns` (or all `list: true` fields), plus an "Overdue By" duration column (e.g. `12d 4h 30m`) for resources with a Due Rule.
3. THE Report Model SHALL include `title`, `resource`, `filters`, `count`, `fileName`, `generatedBy` and `generatedAt`.
4. THE API Server SHALL expose `GET /api/reports` (paginated, newest first, only reports for resources the user can read) and `GET /api/reports/:id/download`, which streams the PDF with `Content-Type: application/pdf`.
5. IF the PDF file for a Report record is missing on disk, THEN THE download endpoint SHALL return HTTP 410 with a message suggesting regeneration.

---

### Requirement 11: Voice Agent

**User Story:** As a user with busy hands, I want to ask questions about my data by voice or text and hear the answer, so that I can work hands-free.

#### Acceptance Criteria

1. THE Intent Registry SHALL contain built-in Intents generated for every Resource: `COUNT_ALL` ("how many <label/synonym>"), `COUNT_BY_VALUE` ("how many <synonym> are <enum value>"), `LIST_OVERDUE` ("which <synonym> are overdue") and `DUE_SOON` ("what is due this week").
2. THE Intent Registry SHALL load app Intents from `server/src/intents/`. App Intents SHALL be matched before built-in Intents.
3. THE Intent Parser SHALL be a pure function `parseIntent(text, registry)` returning `{ intent, params }`. When nothing matches, it SHALL return `{ intent: 'UNKNOWN', params: {} }`.
4. THE API Server SHALL expose `POST /api/voice/ask` with `{ text }`, returning `{ transcript, intent, answer, data }` as JSON.
5. WHERE `VOICE_PROVIDER` is `openai`, THE API Server SHALL expose `POST /api/voice/query` accepting multipart audio (≤ 10 MB, field `audio`). It SHALL transcribe with `whisper-1`, answer as in 11.4, synthesize speech with `tts-1` voice `alloy`, and return `audio/mpeg` with the transcript and answer in the `X-Transcript` and `X-Answer` headers (URI-encoded).
6. IF an OpenAI call fails, THEN THE Voice Service SHALL return HTTP 502 with a descriptive message, and THE Voice Agent UI SHALL display it as text.
7. WHERE `VOICE_PROVIDER` is `browser`, THE Voice Agent UI SHALL use the Web Speech API for recognition and `speechSynthesis` for playback, and SHALL call `POST /api/voice/ask`.
8. IF the browser supports neither MediaRecorder nor the Web Speech API, THEN THE Voice Agent UI SHALL show a text input that calls `POST /api/voice/ask`.
9. THE Voice Agent SHALL only answer with data from Resources the current user can `read`. An Intent targeting another Resource SHALL produce a "you don't have access" answer.
10. THE Voice Agent UI SHALL show idle, listening, thinking, speaking and error states, a transcript of the last question, the text answer, and a list of example questions generated from the Intent Registry via `GET /api/voice/examples`.

---

### Requirement 12: Error Handling

**User Story:** As a client developer, I want consistent error responses, so that I can show useful messages.

#### Acceptance Criteria

1. THE API Server SHALL respond to every error with JSON `{ error: string }` and, for validation errors, `fields`.
2. WHEN a thrown error has a numeric `status` between 400 and 599, THE Error Handler SHALL use that status and the error's message.
3. WHEN a Mongoose `ValidationError` is thrown, THE Error Handler SHALL respond with HTTP 400. A duplicate-key error SHALL produce HTTP 409. A `CastError` on an id SHALL produce HTTP 404.
4. WHEN any other error is thrown, THE Error Handler SHALL respond with HTTP 500 and `{ error: 'Internal server error' }`, and SHALL not include stack traces or internal messages in the response.
5. THE API Server SHALL respond to unknown `/api/*` paths with HTTP 404 JSON.

---

### Requirement 13: Client Shell and Generic Resource UI

**User Story:** As a user, I want a polished, responsive interface generated from resource metadata, so that every app feels complete from day one.

#### Acceptance Criteria

1. THE Client SHALL implement routes `/login`, `/`, `/r/:key`, `/r/:key/new`, `/r/:key/:id`, `/reports`, `/voice` and `/users` (Superuser only). Every route except `/login` SHALL redirect unauthenticated users to `/login`.
2. THE Client SHALL render a sidebar with Dashboard, one link per readable Resource (label and icon from meta), Reports, Voice Agent, Users (Superuser only), and any app-specific links registered in `client/src/appRoutes.jsx`.
3. THE Resource List Page SHALL render a table of `list: true` fields, filter controls for `filter: true` fields, a search box when any field has `search: true`, pagination, and a Create button only when the user can `create`.
4. THE Resource Form SHALL render an input per non-hidden, non-secret field according to its type: text, textarea, number, switch, date picker, select for enum, and async searchable select for ref. It SHALL show server field errors inline.
5. THE Resource Detail Page SHALL show all visible fields, a status badge with buttons for allowed Status Flow transitions (when the user can `update`), Edit and Delete actions according to permissions, and the record's Activity timeline.
6. THE Client SHALL hide, rather than disable, every control the user's role is not permitted to use, using `can(role, resource, action)` from `lib/can.js`, which mirrors the server rule including the Superuser rule.
7. THE Client SHALL show toast notifications for the success and failure of every mutation.
8. THE Client SHALL render correctly from 375px to 1920px width. Below the `md` breakpoint the sidebar SHALL collapse into a slide-over menu.
9. THE Client SHALL meet WCAG 2.1 AA contrast in both themes and provide `aria-label`s for icon-only buttons.

---

### Requirement 14: Theming

**User Story:** As an app builder, I want to restyle my app with a few tokens, so that each app has its own identity while sharing components.

#### Acceptance Criteria

1. THE Client SHALL define all colors, radii and fonts as CSS variables in `client/src/theme/tokens.css`. Components SHALL reference only these tokens.
2. THE Skeleton SHALL ship a default "Crypt" theme (dark, bone-white text, ember accent) and a light variant toggled from the top bar. The choice SHALL be persisted per browser.
3. WHERE the user's OS requests reduced motion, THE Client SHALL disable decorative animations (floating ghosts, flicker effects).

---

### Requirement 15: Demo Readiness

**User Story:** As a hackathon judge, I want to run or open the app and immediately see it working, so that I can evaluate it in minutes.

#### Acceptance Criteria

1. THE Server SHALL expose `GET /api/health`, returning `{ status: 'ok', app, demo, voiceProvider }`.
2. THE Server SHALL provide `npm run seed`, which idempotently creates one demo user per role (from `crypt.config.js`) and demo records for every Resource.
3. THE Login Page SHALL, in Demo Mode only, show one-click "Sign in as <Role>" buttons for each demo user.
4. Each app's README SHALL document setup, environment variables, demo credentials, the Resources table and deployment steps.

---

### Requirement 16: Extension Points

**User Story:** As an app builder, I want well-defined hooks for domain logic, so that I can go beyond CRUD without editing Core.

#### Acceptance Criteria

1. THE Resource Definition SHALL support optional `hooks`: `beforeCreate(data, ctx)`, `afterCreate(doc, ctx)`, `beforeUpdate(doc, changes, ctx)` and `afterUpdate(doc, before, ctx)`. `ctx` is `{ user, registry, session, now }`. Hooks run inside the same transaction as the mutation. `beforeCreate` and `beforeUpdate` may return a replacement data or changes object, and that returned object is re-sanitized against the definition. A hook that throws an `httpError` aborts the mutation with that status.
2. THE Field Spec SHALL support `type: 'enum'` with `multiple: true`, stored as an array of allowed values and rendered as a multi-select.
3. THE Status Flow SHALL support `workflowOnly: [values]`. Generic PATCH SHALL return HTTP 409 when moving into or out of these values. Domain services may still set them directly.
4. THE Intent SHALL support `aggregateOnly: true` together with `requires: [roles]`. Such an Intent bypasses the resource read check (Req 11.9) but SHALL only return numbers, never records.
5. THE Server SHALL load app routes from `server/src/routes/app/*.js` (mounted under `/api`), app jobs from `server/src/jobs/app/*.js` (each exporting `{ name, schedule, run, runAtBoot }`), and app dashboard panels from `server/src/dashboard/*.js` (each exporting `{ key, title, roles, load(ctx) }`), with no Core edits.
6. THE Report Service SHALL export `createReport({ title, resource, filters, user, render })`, where `render(doc, helpers)` draws custom PDF content. Custom reports are then persisted, listed and downloaded like generic ones.
7. THE Client SHALL render app dashboard panels returned by `/api/dashboard` under `panels[]` using `client/src/dashboard/<key>.jsx` when that file exists, and otherwise a generic table.
8. THE Resource Definition SHALL support an optional `extendSchema(schema)` callback. It is invoked before the Mongoose model is compiled, so apps can add sub-document paths or indexes (e.g. partial unique indexes). Paths added this way are treated as `hidden` in meta unless declared in `fields`.
9. THE Voice Agent UI SHALL render an intent's `data` with `client/src/voice/<INTENT_NAME>.jsx` when that file exists, and otherwise show the text answer only.

> Criteria 10–15 were added after building Lab Ledger and Pantry Ghost. Both apps had to work around these gaps in app code (see docs/KIRO_USAGE.md).

10. THE Resource Definition SHALL support `hooks.beforeDelete(doc, ctx)` and `hooks.afterDelete(doc, ctx)`, run in the delete transaction for both soft and hard deletes. A `beforeDelete` that throws an `httpError` aborts the delete with that status.
11. THE runtime context SHALL accept an optional `clock` function. Hook `ctx.now`, the Overdue Sweeper default, voice answers and dashboard "due soon" windows SHALL all read time through it, so tests can inject a fixed time.
12. THE Resource Definition SHALL support `genericDisabled` (a subset of `create`, `update`, `delete`). The generic `/api/r/:key` routes SHALL answer HTTP 405 for those actions for every role, including the Superuser. Meta SHALL report those actions as not permitted, so the generic UI hides their controls. Domain routes are unaffected.
13. THE Client SHALL render `client/src/detail/<resourceKey>.jsx`, when it exists, as an extra panel on that resource's detail page. The panel receives `{ record, resource }`.
14. THE Client SHALL support bulk actions declared in `client/src/appRoutes.jsx` as `bulkActions[resourceKey] = [{ label, icon, roles?, run({ api, ids, items }) }]`. WHEN any bulk action is available to the user, the Resource List Page SHALL show row checkboxes (desktop and mobile), a select-all control and an action bar.
15. THE Skeleton SHALL ship `server/jest.config.js` with a `core` project that runs the skeleton's own suites against a frozen reference config (`server/test/core/`), and an `app` project that runs every other suite against the app's real `crypt.config.js`. Apps raised from the skeleton SHALL run all skeleton suites unchanged with no extra configuration.
