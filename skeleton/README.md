# 🦴 Crypt Kit: the skeleton

A lean full-stack template for role-secured internal tools. You describe each kind of record once, as a **resource definition**. From that one file the skeleton gives you:

- a REST API with role-based access control
- screens: a list with filters and search, create/edit forms, and a detail page with a history timeline
- a dashboard with charts, plus an overdue sweeper that flags late records
- PDF reports
- a voice agent that answers questions like "which notes are overdue?"
- accounts (sign-up with approval, password reset by email, change password), notifications with email, CSV import/export, saved views, QR codes with short IDs and a scan page, and OpenAPI docs
- clickable rows, sortable columns, Board and Calendar views, subtasks, comments, duplicate, a Ctrl+K search palette and date-range filters. See the [feature list](../README.md#shared-features-every-app-gets-them-from-the-skeleton).

Live demo: https://crypt-kit.netlify.app

Lab Ledger and Pantry Ghost in this repo were both raised from this folder.

## The example modules

Crypt Kit ships a small to-do suite so a fresh install is useful straight away. Each module is one file in `server/src/resources/` and a file of demo data in `server/src/seed/data/`; there is no client code. Delete any you do not need (keep `notes.js` if you keep Reminders or the Time log, because they point at notes).

| Module | What it is for | Good to know |
|---|---|---|
| **Notes** | The to-do items: title, status, priority, owner, due date, tags, subtasks and a **Project**. | Short IDs (`N-0001`) and QR codes; overdue notes are flagged by the sweeper. |
| **Projects** | Groups notes. Status flow Planning, Active, On hold, Completed, Archived, with **Overdue** set automatically once the due date passes. | Milestones checklist; Board view by status; filter notes by project. |
| **Reminders** | Something to do at a date and time. | When the time passes while still Pending, the sweeper marks it **Missed** and notifies the owner (bell, and email if set up). Snooze by editing the time and moving it back to Pending. |
| **Goals** | Bigger aims split into milestones. | **Progress is worked out from the ticked milestones** and cannot be typed, so it never drifts. Overdue after the target date. |
| **Time log** | Minutes spent, optionally against a note. | Day defaults to today and "Logged by" to you; the Calendar view shows the log by day. |

New records default their owner to the person creating them. New apps raised with `npm run summon` get these modules too; Lab Ledger and Pantry Ghost do not use them.

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

The server validates these at start-up and stops with a message naming the variable when something is wrong.

| Variable | Default | Notes |
|---|---|---|
| `DEMO_MODE` | `false` | `true` uses an in-memory DB, auto-seeds data, enables the one-click demo accounts and generates a random JWT secret when none is set |
| `DEMO_PERSIST` | `false` | With `DEMO_MODE=true`: keep demo data in `MONGODB_URI` instead of in memory (for hosts that cannot run mongod). Requires `MONGODB_DB_NAME` ending in `_demo` or `_test` |
| `MONGODB_URI` | — | Required unless `DEMO_MODE=true` |
| `MONGODB_DB_NAME` | — | Use this database instead of the one named in the URI, e.g. `crypt_kit_test` |
| `SEED_ON_BOOT` | `false` | Seed demo data into a real database at start-up; only when `MONGODB_DB_NAME` ends in `_test` |
| `JWT_SECRET` | — | Required unless demo mode; at least 32 characters. Set it in demo mode too, or sign-ins end at every restart |
| `PORT` | `5000` | |
| `CLIENT_URL` | `http://localhost:5173` | The client's address: CORS origin, links in emails and the address inside QR codes |
| `TRUST_PROXY` | `false` | `true` behind one reverse proxy (Render, Railway, Heroku) so rate limits see visitor addresses |
| `LOGIN_RATE_MAX` | `10` | Sign-in attempts per 15 minutes per IP and email |
| `AUTH_RATE_MAX` | 5 / 10 | Overrides the per-IP limits on sign-up, forgot-password (5) and reset-password (10) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | — / `587` | Optional email. All four of host, user, password and sender, or none |
| `MAIL_REPLY_TO` | — | Optional reply address |
| `MAIL_ALLOW_TEST_DOMAINS` | `false` | Deliver to `.test` / `.example` addresses (only for a local fake mail server) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | — | Optional owner account (superuser) created by the seed. Both email and password, password at least 8 characters |
| `OPENAI_API_KEY` | — | Optional; enables Whisper + TTS |
| `VOICE_PROVIDER` | auto | `openai` when a key is set, otherwise `browser` (Web Speech API) |

App settings live in `server/crypt.config.js`: the app name, the roles (ordered highest first, where the first role is the superuser), demo users, the report organization, time zone and PDF colours (`reports.theme`), `notifyRoles` (extra roles to notify per resource) and `routineDueRules` (resources whose due rule changes status silently).

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

**Field types:** `string`, `text`, `number`, `boolean`, `date`, `enum` (`multiple: true` for tags), `ref` (`'User'` or another resource key) and `checklist` (subtasks: items of `{ text, done }`, `max` items, default 50; cannot be filtered, searched or unique).

**Flags:** `required`, `list`, `filter`, `search`, `hidden`, `secret`, `unique`, `min`, `max`, `default`, `label`, `help`, `placeholder`, `formHidden` (shown in lists and details, never in forms, e.g. an ID set by a hook) and, for dates, `time: true` (date-time picker).

**Resource options worth knowing:** `comments: false` turns the comment thread off for a resource (use it where free text must not be stored); a `statusFlow` adds the Board view and a `due` rule or a `date` list column adds the Calendar view, with no client code.

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
| QR codes, short IDs, scan lookup, label sheets | `client/src/qrCodes.js` → `{ [resourceKey]: { idField, idLabel, example, target(record) } }`; generate the ID in a `beforeCreate` hook with `server/src/utils/itemCode.js` (see `resources/notes.js`) and backfill old records with a boot job like `jobs/app/itemCodes.job.js` |
| Demo data | `server/src/seed/data/<resource>.js` → `{ resource, records(ctx) }` |
| Re-skin | `client/src/theme/tokens.css` and the `Logo` in `client/src/components/spooky`. Also copy the light palette into `reports.theme` in `crypt.config.js` so PDFs match; `pdfTheme.test.js` fails if the two drift apart |

## Raise a new app

From the repo root:

```bash
npm run summon -- my-app "My App"
```

## Tests

```bash
npm test --prefix server     # Jest + fast-check, 227 tests: correctness properties, integration, accounts,
                             # email, CSV, notifications, voice, reports (jest.config.js runs the core
                             # suites against the frozen config in test/core/)
npm test --prefix client     # Vitest, 163 tests: permission mirror property, role-based UI, accounts, QR and
                             # scan, dialogs, voice states, WCAG contrast
npm run smoke --prefix server  # boots demo mode and runs 31 HTTP checks
```

## Deploy

The live demo runs the client on Netlify (`client/netlify.toml`) and the API on Render with MongoDB Atlas. The full steps and variables are in the [root README](../README.md#deploy-netlify--render--mongodb-atlas).

- **Public demo:** `DEMO_MODE=true` with `DEMO_PERSIST=true` and `MONGODB_DB_NAME=crypt_kit_demo` keeps the one-click accounts and stores the data in Atlas; the first start seeds it.
- **Real use:** leave `DEMO_MODE` off, set `MONGODB_URI`, `JWT_SECRET` and `CLIENT_URL`, then run `npm run seed --prefix server` once to create the demo users and sample records (only collections that are still empty are filled).
