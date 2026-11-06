# Design Document

## Overview

Crypt Kit is a skeleton for building role-secured internal tools. The central idea is that **one declarative Resource Definition drives every layer**:

```
resources/equipment.js ──► defineResource() ──► Mongoose model
                                  │
                                  ├──► generic router  /api/r/equipment  (RBAC from permissions)
                                  ├──► /api/meta       ──► client renders list/detail/form screens
                                  ├──► dashboard aggregates (enum breakdowns, due counts)
                                  ├──► overdue sweeper  (due rule)
                                  ├──► PDF reports      (report.columns)
                                  └──► voice intents    (voice.synonyms → COUNT_ALL, COUNT_BY_VALUE, …)
```

When an app needs more than CRUD (checkout workflows, FEFO picking), it adds hand-written files using the same **route → controller → service → model** layering as the original asset management system. The generic and hand-written code sit side by side and share middleware, the activity log and error handling.

The architecture is REST over HTTP/JSON, plus multipart for voice audio. MongoDB through Mongoose is the persistence layer. JWTs carry `{ userId, role, name }`.

---

## App Structure (identical in `/skeleton`, `/lab-ledger`, `/pantry-ghost`)

```
<app>/
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── crypt.config.js
│   ├── uploads/reports/.gitkeep
│   └── src/
│       ├── app.js
│       ├── server.js
│       ├── config/
│       │   ├── env.js
│       │   └── db.js
│       ├── core/
│       │   ├── defineResource.js
│       │   ├── fieldTypes.js
│       │   ├── registry.js
│       │   ├── permissions.js
│       │   ├── statusFlow.js
│       │   ├── intentRegistry.js
│       │   └── builtinIntents.js
│       ├── middleware/
│       │   ├── auth.js               # authenticate
│       │   ├── requireRole.js        # requireRole(...roles)
│       │   ├── requirePermission.js  # requirePermission(keyOrFn, action)
│       │   ├── resolveResource.js    # :key → req.resource, 404 if unknown
│       │   ├── upload.js             # multer memory storage, 10 MB, audio/* only
│       │   └── errorHandler.js
│       ├── models/
│       │   ├── User.js
│       │   ├── ActivityLog.js
│       │   └── Report.js
│       ├── routes/
│       │   ├── auth.js · users.js · meta.js · resources.js
│       │   ├── activity.js · dashboard.js · reports.js · voice.js
│       │   └── index.js              # mounts everything under /api, plus app routes
│       ├── controllers/              # one per route file
│       ├── services/
│       │   ├── authService.js · userService.js · resourceService.js
│       │   ├── activityService.js · dashboardService.js · reportService.js
│       │   ├── voiceService.js · speechService.js (OpenAI wrapper)
│       │   └── sweeperService.js
│       ├── resources/                # app-specific (skeleton ships example: notes.js)
│       ├── intents/                  # app-specific
│       ├── jobs/index.js             # cron registrations
│       ├── seed/index.js             # demo users + per-resource demo records
│       └── utils/
│           ├── asyncHandler.js · httpError.js · pagination.js
│           ├── diff.js · pdfGenerator.js · escapeRegex.js
└── client/
    ├── package.json · vite.config.js · tailwind.config.js · index.html
    └── src/
        ├── main.jsx · App.jsx · appRoutes.jsx
        ├── api/        auth.js · meta.js · resources.js · reports.js · voice.js · users.js · dashboard.js
        ├── context/    AuthContext.jsx · MetaContext.jsx
        ├── hooks/      useApi.js · useAuth.js · useMeta.js · usePermission.js · useRecorder.js · useSpeech.js
        ├── lib/        utils.js · can.js · format.js
        ├── theme/      tokens.css · ThemeToggle.jsx
        ├── components/
        │   ├── ui/        (shadcn: button, input, select, dialog, table, badge, card, skeleton, sheet, switch, label, textarea, dropdown-menu)
        │   ├── layout/    AppShell.jsx · Sidebar.jsx · Topbar.jsx · ProtectedRoute.jsx
        │   ├── resource/  ResourceTable.jsx · ResourceFilters.jsx · ResourceForm.jsx · FieldInput.jsx
        │   │              RefSelect.jsx · StatusBadge.jsx · StatusActions.jsx · ActivityTimeline.jsx
        │   └── spooky/    GhostOrb.jsx · EmptyCrypt.jsx · FogBackground.jsx
        └── pages/      Login.jsx · Dashboard.jsx · ResourceList.jsx · ResourceDetail.jsx
                        ResourceCreate.jsx · Reports.jsx · VoiceAgent.jsx · Users.jsx · NotFound.jsx
```

---

## Architecture

### Request Flow

```
Browser (React)
   │  axios (useApi) + Bearer JWT
   ▼
Express app.js ── helmet ── cors ── json ── /api router
   │
   ├─ /api/r/:key/...  ─ authenticate ─ resolveResource ─ requirePermission(req.resource, action)
   │                       │
   │                       └─ resourceController ─ resourceService(resource) ─ resource.model ─ MongoDB
   │                                                   └─ activityService.record()
   │
   ├─ /api/<domain>    ─ authenticate ─ requirePermission('<key>', action) ─ domain controller ─ service
   │
   ├─ /api/voice/query ─ authenticate ─ upload ─ voiceController
   │                       └─ speechService.transcribe (Whisper) → voiceService.answer(text, user)
   │                          → speechService.speak (TTS) → audio/mpeg
   │
   └─ errorHandler (last)
```

### Boot Sequence (`server.js`)

1. `env.js` validates the environment and exits with a clear message on failure (Req 2.3, 2.4).
2. `db.js` connects to Mongo. In DEMO_MODE it starts `MongoMemoryReplSet` first (Req 2.5).
3. `registry.loadResources()` imports every `src/resources/*.js` file and checks for unique keys (Req 4.5).
4. `intentRegistry.build(registry, appIntents)` creates the ordered intent list (Req 11.1, 11.2).
5. In DEMO_MODE, `seed.run()` runs.
6. `jobs.start()` runs the sweeper once, then every 15 minutes (Req 8.1).
7. `app.listen(PORT)`.

---

## Resource Definition

### Example (`skeleton/server/src/resources/notes.js`)

```js
import { defineResource } from '../core/defineResource.js';

export default defineResource({
  key: 'notes',
  label: 'Notes',
  icon: 'scroll-text',                // lucide icon name
  titleField: 'title',
  fields: {
    title:    { type: 'string', required: true, max: 120, list: true, search: true },
    body:     { type: 'text' },
    status:   { type: 'enum', values: ['Open', 'Done', 'Overdue', 'Archived'], default: 'Open', list: true, filter: true },
    owner:    { type: 'ref', ref: 'User', list: true, filter: true },
    dueDate:  { type: 'date', list: true },
    pinned:   { type: 'boolean', default: false },
  },
  permissions: {
    read:   ['Admin', 'Member', 'Viewer'],
    create: ['Admin', 'Member'],
    update: ['Admin', 'Member'],
    delete: ['Admin'],
  },
  statusFlow: {
    field: 'status',
    transitions: { Open: ['Done', 'Archived'], Overdue: ['Done', 'Archived'], Done: ['Open', 'Archived'], Archived: [] },
  },
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
  softDelete: { field: 'status', value: 'Archived', at: 'archivedAt' },
  report: { columns: ['title', 'status', 'owner', 'dueDate'] },
  voice: { synonyms: ['notes', 'tasks', 'to-dos'] },
  defaultSort: '-createdAt',
});
```

### Field Spec Types (`core/fieldTypes.js`)

| type | Mongoose | Client input | Allowed flags |
|---|---|---|---|
| `string` | String | `<Input>` | required, min/max (length), unique, list, filter, search, hidden, secret, default |
| `text` | String | `<Textarea>` | required, max, search, hidden |
| `number` | Number | `<Input type=number>` | required, min, max, list, filter, default |
| `boolean` | Boolean | `<Switch>` | default, list, filter |
| `date` | Date | date picker | required, list, filter |
| `enum` | String + enum | `<Select>` | **values** (required), default, list, filter |
| `ref` | ObjectId + ref | `<RefSelect>` (async search) | **ref** (required), required, list, filter |

`defineResource` validation (Req 4.3, 4.4) is a pure function `validateDefinition(def, roles)`. It returns an array of error strings, and `defineResource` throws when the array is non-empty. Because the function is pure, Property 2 can test it directly.

### Model generation

`buildSchema(def)` maps each Field Spec to a Mongoose path. It then adds `createdBy: { type: ObjectId, ref: 'User' }` and `{ timestamps: true }`, plus the `softDelete.at` and `secret` (`select: false`) paths. It creates indexes on every `filter: true` field and a text-free regex search across `search: true` fields. The model name is the PascalCase form of the key, and `mongoose.models[name]` is reused so hot-reload works.

---

## Core Components

### Permissions (`core/permissions.js`): pure, mirrored in `client/src/lib/can.js`

```js
export function can(role, resourceDef, action, roles) {
  if (!role || !roles.includes(role)) return false;
  if (role === roles[0]) return true;                 // Superuser rule (Req 3.5)
  return (resourceDef.permissions?.[action] ?? []).includes(role);
}
```

`requirePermission(keyOrResource, action)` resolves the resource and calls `can`. It returns 403 on false. `authenticate` must run before it.

### Status Flow (`core/statusFlow.js`): pure

```js
export function canTransition(flow, from, to) {
  if (from === to) return true;
  return (flow.transitions[from] ?? []).includes(to);
}
```

### Resource Service (`services/resourceService.js`)

`resourceService(resource)` returns `{ list, get, create, update, remove }`:

- `list(query, user)` → `buildFilter(resource, query)` turns `filter: true` fields into equality filters (casting by type) and `q` into `$or` of `{ $regex: escapeRegex(q), $options: 'i' }` across search fields. Soft-deleted records are excluded unless `includeDeleted` is set and the user is the Superuser. Pagination comes from `utils/pagination.js` (Req 5.3).
- `create(body, user)` → `sanitize(resource, body)` keeps only declared fields. It then creates the record, sets `createdBy`, and calls `activity.record(create)`.
- `update(id, body, user)` → sanitizes the body. It loads the current doc and, if the status field changes, checks `canTransition`, throwing 409 when not allowed. It computes the diff, saves with validators, and records `update` (plus `status` when the status changed).
- `remove(id, user)` → soft delete or hard delete according to the definition, then records `delete`.

### Activity Service

`record({ actor, resource, recordId, action, diff })` inserts an entry into `ActivityLog`. `actor` is either a User id or the literal `'system'`. `diff` comes from `utils/diff.js`, which compares before and after over declared non-secret fields only.

### Overdue Sweeper (`services/sweeperService.js`)

```js
export async function sweep(registry, now = new Date()) {
  const results = {};
  for (const r of registry.withDue()) {
    const { field, status, from, to } = r.def.due;
    const filter = { [field]: { $ne: null, $lt: now }, [status]: { $in: from } };
    const ids = await r.model.find(filter).distinct('_id');
    if (ids.length) {
      await r.model.updateMany({ _id: { $in: ids } }, { $set: { [status]: to } });
      await activity.recordMany(ids.map(id => ({ actor: 'system', resource: r.key, recordId: id, action: 'status', diff: { [status]: [from, to] } })));
    }
    results[r.key] = ids.length;
  }
  return results;
}
```

### Intent Registry (`core/intentRegistry.js`)

An Intent has this shape:

```js
{
  name: 'COUNT_BY_VALUE',
  resource: 'notes',                 // optional: used for the permission check (Req 11.9)
  examples: ['how many notes are done'],
  match(text) { return params | null },        // pure
  async handle(params, ctx) { return data },   // ctx = { registry, user, now }
  respond(data, params) { return 'string' },   // pure
}
```

`builtinIntents(registry)` generates four intents per resource, using regexes built from `voice.synonyms` (escaped) and enum `values`. `parseIntent(text, intents)` normalizes the text (lowercase, strip punctuation, collapse whitespace) and returns the first `{ intent, params }` whose `match` is non-null. App intents are prepended (Req 11.2).

### Voice Service

```
answer(text, user):
  { intent, params } = parseIntent(text, intents)
  if intent.resource and !can(user.role, resource, 'read') → "Sorry, you don't have access to <label>."
  data   = await intent.handle(params, ctx)
  answer = intent.respond(data, params)
  return { transcript: text, intent: intent.name, answer, data }
```

`speechService` wraps OpenAI. Each call is wrapped in try/catch and rethrown as `httpError(502, 'Speech service error: ' + message)` (Req 11.6). The client is created lazily, so the server starts without a key.

### PDF Generator (`utils/pdfGenerator.js`)

`PdfBuilder` wraps PDFKit and produces an "exception report" style that matches the operations reports teams already use. Pages are A4 landscape with 28pt margins. Page 1 has a navy upper-case title, a right-aligned "Generated on" timestamp (from `crypt.config.reports.timeZone`), and a meta line (`Organization | filters | Generated by | Total Records`, where the organization comes from `crypt.config.reports.organization`). The table is a bordered grid with a navy header row repeated on each page, zebra rows and an automatic "Sl No" column. Column widths are measured from the text: each column first gets room for its longest word, so codes never break, and dates and durations stay on one line. Columns can carry `value(row)` (computed cells, e.g. durations) and `link(row)` (a blue "View on Map"-style link under the value). Every page has a footer `<APP> - <TITLE>` with `Page x of y`. The cell formatter prints dates as DD-MM-YYYY (with HH:mm when a time is set), durations as `193d 23h 26m`, refs by name and booleans as Yes/No. `renderReport(...)` is the one-table shortcut.

### Extension Points (Req 16)

| Need | Mechanism | Used by |
|---|---|---|
| Side effects on CRUD | `hooks.beforeCreate / afterCreate / beforeUpdate / afterUpdate` run inside `withTransaction` | Lab Ledger: calibration schedules next due; Pantry Ghost: household code generation |
| Multi-value tags | `{ type: 'enum', multiple: true, values }` → `[String]` with enum | Pantry Ghost `households.dietary` |
| Extra schema paths / indexes | `extendSchema(schema)` called before `mongoose.model()` | Lab Ledger partial unique index on active checkouts; Pantry Ghost `distributions.lines` |
| States owned by a workflow | `statusFlow.workflowOnly: ['CheckedOut']` → generic PATCH 409 | Lab Ledger equipment |
| Non-CRUD endpoints | `src/routes/app/*.js` auto-mounted under `/api` | checkouts, labels, intake, distributions, impact report |
| Custom jobs | `src/jobs/app/*.js` `{ name, schedule, run, runAtBoot }` | Pantry Ghost expiry classifier |
| Dashboard panels | `src/dashboard/*.js` `{ key, title, roles, load }` + optional `client/src/dashboard/<key>.jsx` | "Out right now", "Use First" |
| Rich voice results | `client/src/voice/<INTENT>.jsx` loaded with `import.meta.glob` | Pantry Ghost intake confirm card |
| Guard deletes | `hooks.beforeDelete / afterDelete` (in-transaction, soft and hard) | Lab Ledger: no retiring an item that is out on loan |
| Deterministic time | `setContext({ ..., clock: () => fixedDate })`; `now()` from context.js is used by hooks, sweeper, voice and dashboard | calibration and expiry property tests |
| Workflow-only resources | `genericDisabled: ['create','update','delete']` → generic routes 405, meta reports the actions as not permitted | Pantry Ghost distributions |
| Extra detail panels | `client/src/detail/<key>.jsx` receives `{ record, resource }` | Pantry Ghost distribution lines |
| Bulk actions | `bulkActions` export in `appRoutes.jsx` → row selection and action bar on the list page | Lab Ledger: print QR labels for the selected equipment |
| Aggregate voice answers | intent `{ aggregateOnly: true, requires: [...] }` | Pantry Ghost `HOUSEHOLDS_SERVED` for Board |
| Custom PDFs | `reportService.createReport({ ..., render(doc, helpers) })`; helpers = `{ table, heading, kv, barChart }` | Pantry Ghost impact report |

The extension points are loaded by `core/registry.js` (resources), `routes/index.js` (app routes), `jobs/index.js` (app jobs) and `dashboardService` (panels). Each loader is a `readdir` followed by a dynamic `import()`, so **apps never edit Core**. That is the property the `sync-core` hook protects.

---

## Data Models

```js
// models/User.js
{ name: String!, email: String! unique lowercase, passwordHash: String! select:false,
  role: { type: String, enum: config.roles, required }, active: { Boolean, default: true }, createdAt }

// models/ActivityLog.js  (append-only; no update/delete routes)
{ actor: Mixed /* ObjectId | 'system' */, actorName: String, resource: String!, recordId: ObjectId!,
  action: enum['create','update','delete','status']!, diff: Mixed, at: { Date, default: now, index } }
  index: { resource: 1, recordId: 1, at: -1 }

// models/Report.js
{ title: String!, resource: String!, filters: Mixed, count: Number!, fileName: String!,
  generatedBy: ObjectId ref User!, generatedAt: { Date, default: now } }
```

---

## API Endpoints

| Method | Path | Auth / Permission | Notes |
|---|---|---|---|
| GET | `/api/health` | public | `{ status, app, demo, voiceProvider }` |
| GET | `/api/meta/public` | public | `{ appName, theme, demo, demoUsers? }` (demoUsers only in DEMO_MODE: email+role) |
| POST | `/api/auth/login` | public | `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` | auth | `{ user }` |
| GET/POST | `/api/users` | Superuser | list / create |
| PATCH | `/api/users/:id` | Superuser | role, active, name |
| GET | `/api/meta` | auth | resources filtered by read permission |
| GET | `/api/r/:key` | read | `?page&limit&sort&q&<filterField>=` |
| POST | `/api/r/:key` | create | 201 `{ item }` |
| GET | `/api/r/:key/:id` | read | `{ item }` with refs populated |
| PATCH | `/api/r/:key/:id` | update | `{ item }`; 409 on illegal status transition |
| DELETE | `/api/r/:key/:id` | delete | 200 `{ item }` (soft) or 204 (hard) |
| GET | `/api/r/:key/:id/activity` | read | entries newest first |
| GET | `/api/activity` | Superuser | latest 50 |
| GET | `/api/dashboard` | auth | per readable resource stats + recent activity |
| POST | `/api/reports` | read on `resource` | 201 `{ report }` |
| GET | `/api/reports` | auth | paginated, newest first, readable resources only |
| GET | `/api/reports/:id/download` | read on report.resource | `application/pdf`; 410 if file missing |
| POST | `/api/voice/ask` | auth | `{ text }` → `{ transcript, intent, answer, data }` |
| POST | `/api/voice/query` | auth (openai provider) | multipart `audio` → `audio/mpeg`, headers `X-Transcript`, `X-Answer` |
| GET | `/api/voice/examples` | auth | up to 8 example questions for readable resources |

---

## Frontend Architecture

### State

- **Server state:** React Query. Keys are `['meta']`, `['dashboard']`, `['r', key, params]`, `['r', key, id]`, `['activity', key, id]` and `['reports', page]`.
- **Auth:** `AuthContext` stores the JWT in `localStorage` under `<appName>_token` and decodes `{ userId, role, name, exp }`. A token past `exp` counts as logged out.
- **Meta:** `MetaContext` loads `/api/meta` after login and exposes `resources`, `roles` and `appName`.

### Routing (`App.jsx`)

```jsx
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
    <Route index element={<Dashboard />} />
    <Route path="r/:key" element={<ResourceList />} />
    <Route path="r/:key/new" element={<ResourceCreate />} />
    <Route path="r/:key/:id" element={<ResourceDetail />} />
    <Route path="reports" element={<Reports />} />
    <Route path="voice" element={<VoiceAgent />} />
    <Route path="users" element={<SuperuserOnly><Users /></SuperuserOnly>} />
    {appRoutes.map(r => <Route key={r.path} path={r.path} element={r.element} />)}
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```

`appRoutes.jsx` exports `[{ path, element, label, icon, roles? }]`. The Sidebar appends these links (Req 13.2).

### Voice Agent Page

The page is a state machine: `idle → listening → thinking → speaking → idle`, and any state can move to `error`.
- **openai provider:** `useRecorder()` (MediaRecorder, webm/opus) → `POST /voice/query` as FormData → play the `audio/mpeg` blob in `<audio>` and read `X-Transcript`/`X-Answer`.
- **browser provider:** `useSpeech()` (SpeechRecognition) → `POST /voice/ask` → `speechSynthesis.speak(answer)`.
- **Fallback:** a text box that always calls `/voice/ask`.

A `GhostOrb` component visualises each state: a gentle bob when idle, a pulsing glow when listening, a swirl when thinking, and a mouth animation when speaking. All motion is disabled under `prefers-reduced-motion`.

---

## Error Handling

### Server (`middleware/errorHandler.js`)

```js
export function errorHandler(err, req, res, _next) {
  if (err.name === 'ValidationError') {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return res.status(400).json({ error: 'Validation failed', fields });
  }
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate value', fields: err.keyValue });
  if (err.name === 'CastError') return res.status(404).json({ error: 'Resource not found' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Audio file too large (max 10 MB)' });
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ error: err.message });
  }
  logger.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
```

> Lesson carried over from the asset-management prototype: its handler ignored `err.status`, so every 404/409 thrown from a service became a 500. Property 11 guards against that regression.

### Client

- The `useApi` interceptor logs the user out on 401 and sends them to `/login` with a "Session expired" toast.
- On 403 it shows a toast saying "You don't have permission to do that". This case only arises when the server and client are out of sync.
- `fields` from a 400 response are mapped onto form inputs via `react-hook-form`'s `setError`.

---

## Key Dependencies

**Server:** express, cors, helmet, dotenv, mongoose, jsonwebtoken, bcryptjs, multer, node-cron, pdfkit, openai, uuid, mongodb-memory-server (dependency, because DEMO_MODE runs in production demos). **Dev:** jest, fast-check, supertest.

**Client:** react, react-dom, react-router-dom, @tanstack/react-query, axios, react-hook-form, tailwindcss, @radix-ui/* (via shadcn), class-variance-authority, clsx, tailwind-merge, lucide-react, recharts, react-hot-toast. **Dev:** vite, @vitejs/plugin-react, vitest, @testing-library/react, jsdom.

---

## Security Considerations

- Passwords use bcrypt (cost 10–12). `passwordHash` has `select: false` and is never serialized.
- JWTs expire after 24 hours. The secret must be at least 32 characters outside demo mode.
- Bodies are sanitized against definitions to block mass assignment of `createdBy`, `role` and similar fields.
- `q` search input is regex-escaped (`escapeRegex`) to prevent ReDoS and regex injection.
- Mongo operator injection: filter values are cast to field types, so objects such as `{ $gt: '' }` are rejected.
- Uploads: memory storage, a 10 MB limit and an `audio/*` MIME allowlist. Audio is never written to disk or logged.
- Report downloads check `read` permission on the report's resource. `fileName` is a server-generated UUID, never user input, so path traversal is impossible.
- `helmet` defaults are on, and CORS is limited to `CLIENT_URL`.
- Demo credentials are shown only in DEMO_MODE.

---

## Testing Strategy

### Unit (example-based)
Covers each service with mocked models (pattern: `jest.unstable_mockModule`, as in the prototype's `authService.test.js`), along with the middleware, error handler and PDF generator (non-empty buffer starting with `%PDF`).

### Property-Based (fast-check)
Each property below has a `*.property.test.js` file. Pure functions (`can`, `validateDefinition`, `canTransition`, `parseIntent`, `sanitize`, `buildFilter`, `diff`, `paginate`) get 100 runs. DB-backed properties use `mongodb-memory-server` with 25–50 runs.

### Integration
`supertest` against `createApp()` with a memory DB covers login, then CRUD, then status transition, then activity, then report download, for the `notes` example resource.

### Client
Vitest + RTL cover ProtectedRoute redirects, Viewer hiding (Property 15), the voice page states, and field-error mapping on ResourceForm.

### Smoke
Covers `GET /api/health`. A `summon.js` dry-run checks that the target folder contains the expected files.

---

## Correctness Properties

*A property is a characteristic that should hold across all valid executions of a system. It is a formal statement of what the system should do, and it links the human-readable specification to machine-verifiable correctness guarantees.*

### Property 1: JWT Contains Correct Claims for Any Valid User
For any user with a role from `crypt.config.js`, a successful login returns a token whose decoded payload contains that user's `userId`, `role` and `name`, and `exp - iat = 86400`.
**Validates: Requirements 3.1**

### Property 2: Invalid Resource Definitions Are Always Rejected
For any definition produced by mutating a valid definition in exactly one way (unknown field type, enum without values, ref without target, unknown role in permissions, statusFlow/due naming a missing field or value, invalid key), `validateDefinition` returns at least one error naming the resource. For any unmutated valid definition it returns none.
**Validates: Requirements 4.3, 4.4**

### Property 3: Permission Matrix Is Enforced for Every Role × Action
For any generated role list, resource permissions, role and action, `requirePermission` calls `next()` if and only if `can(role, def, action, roles)` is true. `can` is true for the first role on every resource and action.
**Validates: Requirements 3.4, 3.5, 5.1**

### Property 4: Requests Without a Valid JWT Are Rejected
For any protected endpoint and any Authorization header that is missing, malformed, expired, or signed with another secret, the response is 401.
**Validates: Requirements 3.3**

### Property 5: Sanitize Never Stores Undeclared or System Fields
For any resource definition and any input object, `sanitize(def, input)` returns an object whose keys are a subset of the declared field names and never include `createdBy`, `createdAt`, `updatedAt` or `_id`.
**Validates: Requirements 5.4**

### Property 6: Create–Read Round Trip Preserves Declared Fields
For any valid record generated from a definition's Field Specs, creating it and then reading it by id returns equal values for every declared non-secret field.
**Validates: Requirements 4.6, 5.4, 5.5**

### Property 7: Filters Return Exactly the Matching Records
For any set of records and any combination of `filter: true` field values, the list endpoint returns every record matching all filters and no others (non-deleted only).
**Validates: Requirements 5.3, 5.6**

### Property 8: Pagination Partitions the Result Set
For any record count N, limit L (1–100) and sort, concatenating pages 1..pages yields all N records exactly once, and `pages = ceil(N / L)`.
**Validates: Requirements 5.3**

### Property 9: Status Transitions Follow the Flow Exactly
For any status flow and any pair (from, to), an update succeeds if and only if `to === from` or `to ∈ transitions[from]`. Otherwise it returns 409 and leaves the record unchanged.
**Validates: Requirements 5.8**

### Property 10: Every Mutation Produces Exactly One Activity Entry
For any sequence of create/update/delete operations, the number of new Activity Log entries equals the number of successful mutations plus the number of status changes, and no entry's `diff` contains a secret field.
**Validates: Requirements 6.1**

### Property 11: Error Handler Honours Status Codes and Never Leaks Internals
For any error with integer `status` in [400, 599], the response has that status and the error's message. For any error without a valid status (and not a Mongoose/known error), the response is 500 with body exactly `{ error: 'Internal server error' }`.
**Validates: Requirements 12.2, 12.4**

### Property 12: Overdue Sweeper Changes Exactly the Eligible Records
For any set of records with random due dates (past, future or empty) and statuses, and any `now`, after `sweep(registry, now)` a record is in `due.to` if and only if it was already in `due.to`, or its due date was before `now` and its status was in `due.from`. No other field changes.
**Validates: Requirements 8.2, 8.3**

### Property 13: Meta Never Exposes Secret, Hidden or Unreadable Data
For any definitions and role, `/api/meta` contains no field with `secret` or `hidden` and no resource the role cannot read.
**Validates: Requirements 7.2, 7.3**

### Property 14: Intent Parser Recognises Every Generated Example
For any registered resource with synonyms and enum values, each example phrase produced by its built-in intents (with random casing, punctuation and extra whitespace) parses to that intent with the correct `resource` and `value` params. For any string containing no synonym, the result is `UNKNOWN`.
**Validates: Requirements 11.1, 11.3**

### Property 15: Client `can()` Mirrors Server `can()`
For any role list, permissions, role and action, `client/src/lib/can.js` and `server/src/core/permissions.js` return the same boolean. Consequently, for a role without `create`/`update`/`delete`, the rendered list and detail pages contain no Create, Edit, Delete or transition buttons.
**Validates: Requirements 13.6**

### Property 16: Report Rows Match the Filtered Listing
For any filters, the generated report's `count` equals the unpaginated list total for those filters (capped at 5,000).
**Validates: Requirements 10.1**

### Property 17: Voice Answers Respect Read Permissions
For any role and any intent whose resource that role cannot read, `voiceService.answer` returns an access-denied answer and performs no query on that resource's model, unless the intent is `aggregateOnly` and the role is in `requires`.
**Validates: Requirements 11.9, 16.4**

### Property 18: Hook Failures Roll Back the Whole Mutation
For any resource with hooks and any mutation where a hook throws, the record, any documents the hook touched, and the Activity Log are all unchanged afterwards.
**Validates: Requirements 16.1**

### Property 19: Workflow-Only States Are Unreachable Through Generic PATCH
For any status flow with `workflowOnly` values, a generic PATCH into or out of one of those values returns 409, whatever the transitions map says.
**Validates: Requirements 16.3**

### Property 20: Delete Hooks Guard and Roll Back Deletes
For any resource with delete hooks and any record, when `beforeDelete` throws, the record, any documents the hook touched, and the Activity Log are unchanged. When it does not throw, `beforeDelete` and `afterDelete` each run exactly once inside the delete transaction.
**Validates: Requirements 16.10**

### Property 21: Generically Disabled Actions Are Refused for Every Role
For any resource with `genericDisabled` and any role (the Superuser included), a generic request for a disabled action returns 405 and changes nothing, and `/api/meta` reports that action as not permitted.
**Validates: Requirements 16.12**
