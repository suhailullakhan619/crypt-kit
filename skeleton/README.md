# 🦴 Crypt Kit: the skeleton

A lean full-stack template for role-secured internal tools. You describe each kind of record once, as a **resource definition**. From that one file the skeleton gives you:

- a REST API with role-based access control
- screens: a list with filters and search, create/edit forms, and a detail page with a history timeline
- a dashboard with charts, plus an overdue sweeper that flags late records
- PDF reports
- a voice agent that answers questions like "which notes are overdue?"

Lab Ledger and Pantry Ghost in this repo were both raised from this folder.

## Quick start (no database needed)

```bash
npm install --prefix server && npm install --prefix client
cp server/.env.example server/.env        # DEMO_MODE=true by default
npm run dev --prefix server               # API on http://localhost:5000
npm run dev --prefix client               # app on http://localhost:5173
```

In demo mode the server starts an in-memory MongoDB and seeds demo users and records. The first run downloads a MongoDB binary (about 600 MB, cached in `server/node_modules/.cache`).

### Demo accounts

The login page shows one-click buttons for these accounts in demo mode.

| Role | Email | Password |
|---|---|---|
| Admin (superuser) | admin@crypt.test | crypt-admin-demo |
| Member | member@crypt.test | crypt-member-demo |
| Viewer | viewer@crypt.test | crypt-viewer-demo |

## Environment (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `DEMO_MODE` | `false` | `true` uses an in-memory DB, auto-seeds data and generates a random JWT secret |
| `MONGODB_URI` | — | Required unless `DEMO_MODE=true` |
| `JWT_SECRET` | — | Required unless demo mode; at least 32 characters |
| `PORT` | `5000` | |
| `CLIENT_URL` | `http://localhost:5173` | CORS origin |
| `OPENAI_API_KEY` | — | Optional; enables Whisper + TTS |
| `VOICE_PROVIDER` | auto | `openai` when a key is set, otherwise `browser` (Web Speech API) |

App settings live in `server/crypt.config.js`: the app name, the roles (ordered highest first, where the first role is the superuser), demo users, and the report organization and time zone.

## Add a resource

Create a file in `server/src/resources/`, then restart the server. No client code is needed.

```js
import { defineResource } from '../core/defineResource.js';

export default defineResource({
  key: 'potions',                      // → /api/r/potions and /r/potions
  label: 'Potions',
  icon: 'flask-conical',               // any lucide icon name
  titleField: 'name',
  fields: {
    name:    { type: 'string', required: true, list: true, search: true },
    status:  { type: 'enum', values: ['Brewing', 'Ready', 'Spoiled', 'Gone'], default: 'Brewing', list: true, filter: true },
    brewer:  { type: 'ref', ref: 'User', list: true, filter: true },
    readyBy: { type: 'date', list: true },
  },
  permissions: { read: ['Member', 'Viewer'], create: ['Member'], update: ['Member'], delete: [] },
  statusFlow: { field: 'status', transitions: { Brewing: ['Ready', 'Spoiled'], Ready: ['Gone'], Spoiled: [], Gone: [] } },
  due: { field: 'readyBy', status: 'status', from: ['Brewing'], to: 'Spoiled' },
  softDelete: { field: 'status', value: 'Gone', at: 'goneAt' },
  voice: { synonyms: ['potions', 'brews'] },
});
```

**Field types:** `string`, `text`, `number`, `boolean`, `date`, `enum` (`multiple: true` for tags) and `ref` (`'User'` or another resource key).

**Flags:** `required`, `list`, `filter`, `search`, `hidden`, `secret`, `unique`, `min`, `max`, `default`.

## Go beyond CRUD (extension points)

None of these require editing `core/`.

| Need | Where |
|---|---|
| Logic on create/update/delete (runs in the same transaction) | `hooks: { beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete }` in the definition |
| Records only a workflow may create/change/delete | `genericDisabled: ['create', 'update', 'delete']` — generic routes 405 for every role, UI hides the buttons |
| Deterministic time in tests | `setContext({ ...ctx, clock: () => fixedDate })` — hooks (`ctx.now`), sweeper, voice and dashboard use it |
| Extra panel on a detail page | `client/src/detail/<resourceKey>.jsx` → receives `{ record, resource }` |
| Bulk actions with row selection | `bulkActions` export in `client/src/appRoutes.jsx` → `{ label, icon, roles?, run({ api, ids, items }) }` |
| Statuses only a workflow may set | `statusFlow.workflowOnly: ['CheckedOut']` |
| Extra schema paths / indexes | `extendSchema(schema)` in the definition |
| Custom endpoints | `server/src/routes/app/*.js` (default-export an express Router) |
| Background jobs | `server/src/jobs/app/*.js` → `{ name, schedule, run, runAtBoot }` |
| Dashboard panels | `server/src/dashboard/*.js` → `{ key, title, roles, load }`, plus optional `client/src/dashboard/<key>.jsx` |
| Voice questions | `server/src/intents/*.js` → `{ name, match, handle, respond, examples }` |
| Rich voice answers | `client/src/voice/<INTENT>.jsx` |
| Custom PDF reports | `reportService.createReport({ title, resource, user, count, render(doc, h) })` |
| Extra pages / sidebar links | `client/src/appRoutes.jsx` |
| Demo data | `server/src/seed/data/<resource>.js` → `{ resource, records(ctx) }` |
| Re-skin | `client/src/theme/tokens.css` and the `Logo` in `client/src/components/spooky` |

## Raise a new app

From the repo root:

```bash
npm run summon -- my-app "My App"
```

## Tests

```bash
npm test --prefix server     # Jest + fast-check: 21 correctness properties, integration, voice, reports
                             # (jest.config.js runs the core suites against the frozen config in test/core/)
npm test --prefix client     # Vitest: permission mirror property, role-based UI, voice states, WCAG contrast
npm run smoke --prefix server  # boots demo mode and runs HTTP checks
```

## Deploy (Render + MongoDB Atlas)

1. Create a free Atlas cluster, then copy its connection string into `MONGODB_URI`.
2. Create a Render **Web Service** for the server:
   - Root directory: `skeleton/server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: `MONGODB_URI`, a long `JWT_SECRET`, and `CLIENT_URL`
   - For a public demo without a database, set `DEMO_MODE=true` instead.
3. Create a Render **Static Site** for the client:
   - Root directory: `skeleton/client`
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Environment: `VITE_API_URL=https://<your-api>/api`
   - Add a rewrite from `/*` to `/index.html`.
4. Run `npm run seed --prefix server` once against Atlas to create the demo users and data.
