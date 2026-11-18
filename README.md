# 🦴 Crypt Kit

**Kiroween 2026 — Skeleton Crew entry.**

Crypt Kit is a lean, spec-driven full-stack skeleton. You describe your domain as **resource definitions** (fields, roles, status flow, due dates, voice synonyms). The skeleton then raises a working app from them: a REST API with role-based access control, auto-generated CRUD screens, a dashboard, PDF reports, scheduled "overdue" jobs, an activity log, and a voice agent that answers questions about your data.

Two very different apps are raised from the same bones:

| Folder | App | Who it's for | What it shows off |
|---|---|---|---|
| [`skeleton/`](skeleton) | **Crypt Kit** | Developers | The template itself: generic resources, RBAC, voice, PDF, cron |
| [`lab-ledger/`](lab-ledger) | **Lab Ledger** 🧪 | University teaching labs | Unique-item tracking: equipment checkout/return, calibration schedules, "who has the oscilloscope?" by voice |
| [`pantry-ghost/`](pantry-ghost) | **Pantry Ghost** 👻 | Community food banks | Quantity-based stock: donation intake by voice, first-expiry-first-out picking, expiry alerts, impact reports |

## Repository layout

```
crypt-kit/
├── .kiro/                  # Specs, steering, hooks, MCP config (committed on purpose)
│   ├── specs/
│   │   ├── crypt-kit-skeleton/   # requirements.md · design.md · tasks.md
│   │   ├── lab-ledger/
│   │   └── pantry-ghost/
│   ├── steering/           # product, tech, structure, conventions, testing
│   ├── hooks/              # agent hooks that automate the dev loop
│   └── settings/mcp.json   # MCP servers used during development
├── skeleton/               # the template (client + server)
├── lab-ledger/             # app #1 (client + server), raised from skeleton/
├── pantry-ghost/           # app #2 (client + server), raised from skeleton/
├── scripts/summon.js       # copies skeleton/ into a new app folder
└── docs/KIRO_USAGE.md      # write-up: how Kiro was used
```

## Quick start

Requirements: Node.js 20+, plus either MongoDB (local or Atlas) **or** nothing at all. If you set `DEMO_MODE=true`, the server runs an in-memory database seeded with demo data.

```bash
npm run install:all
cp lab-ledger/server/.env.example lab-ledger/server/.env   # edit as needed
npm run dev:lab
```

The client runs on http://localhost:5173 and the API on http://localhost:5000.

The voice agent uses OpenAI Whisper and TTS when `OPENAI_API_KEY` is set. Without a key, it falls back to the browser's Web Speech API, so judges can test it with no key.

## Demo accounts (`DEMO_MODE=true`; the login page also has one-click buttons)

| App | Role → email / password |
|---|---|
| Skeleton | Admin `admin@crypt.test` / `crypt-admin-demo` · Member `member@crypt.test` / `crypt-member-demo` · Viewer `viewer@crypt.test` / `crypt-viewer-demo` |
| Lab Ledger | LabManager `manager@lab.test` / `lab-manager-demo` · Technician `tech@lab.test` / `lab-tech-demo` · Student `student@lab.test` / `lab-student-demo` |
| Pantry Ghost | Coordinator `coordinator@pantry.test` / `pantry-coordinator-demo` · Volunteer `volunteer@pantry.test` / `pantry-volunteer-demo` · Board `board@pantry.test` / `pantry-board-demo` |

## Tests

```bash
npm test              # summon tests, then server + client suites for all three apps
npm run check:core    # proves Core is byte-identical in skeleton, lab-ledger and pantry-ghost
npm run smoke --prefix lab-ledger/server   # boots demo mode and runs the HTTP checks (likewise for each app)
```

| | Server | Client | Smoke |
|---|---|---|---|
| Skeleton | 160 | 92 | 31 checks |
| Lab Ledger | 232 | 109 | 40 checks |
| Pantry Ghost | 243 | 103 | 30 checks |

The tests include 33 property-based correctness properties (`fast-check`), each linked to spec requirements. See [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md).

## Shared features (every app gets them from the skeleton)

| Feature | What it does |
|---|---|
| **CSV export / import** | Every list has *Export CSV* (follows the active search and filters) and *Import CSV*, which checks the file first and writes nothing until you confirm. API: `GET /api/r/:key/export`, `POST /api/r/:key/import` (`dryRun` defaults to true). |
| **Notifications** | Bell in the top bar with unread badge. Due rules notify the superuser, the users on the record, and any roles in `notifyRoles` (`crypt.config.js`). Same event never notifies twice. |
| **Email alerts** | Every notification is also emailed to the user's account address through any SMTP service (tested with Brevo). Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` and optionally `MAIL_REPLY_TO` in `server/.env`; leave them empty to keep alerts in-app only. A half-filled setup stops the server with a clear message. The bell has an *Email me a test* button, and `npm run mail:test -- you@example.com` sends one from the command line. Mail sent "from" a free address such as Gmail often lands in spam: use a sender on your own verified domain for real use. |
| **Change password** | Key icon in the top bar. `POST /api/auth/change-password`. |
| **Login rate limit** | 10 attempts per 15 minutes per IP and email (`LOGIN_RATE_MAX`). |
| **Saved views** | Save the current search and filters on any list as a named chip (kept in this browser). |
| **Date and time fields** | `{ type: 'date', time: true }` renders a date-time picker. |
| **OpenAPI docs** | `GET /api/docs` (signed in) returns an OpenAPI 3 document built from the resource definitions. |
| **Test database safety** | `MONGODB_DB_NAME` picks another database on the same cluster. `SEED_ON_BOOT` only works when that name ends in `_test`, and `DEMO_PERSIST` (demo data in a real cluster) only when it ends in `_demo` or `_test`. |

## Live demo

| App | Site | API |
|---|---|---|
| Crypt Kit (skeleton) | https://crypt-kit.netlify.app | https://crypt-kit.onrender.com/api/health |
| Lab Ledger | https://leb-ledger.netlify.app | https://lab-ledger.onrender.com/api/health |
| Pantry Ghost | https://pantry-ghost.netlify.app | https://pantry-ghost-4e86.onrender.com/api/health |

Use the one-click demo buttons on each login page. The APIs run on Render's free plan and sleep after 15 minutes without traffic, so the first request after that can take about a minute.

## Deploy (Netlify + Render + MongoDB Atlas)

Each app is two deploys from this one repo: the client on Netlify and the API on Render. The API runs on Render because the server runs scheduled jobs and must stay running as a normal process.

**1. API on Render.** New > Web Service, pick this repo, once per app:

| Setting | Value |
|---|---|
| Root Directory | `skeleton/server`, `lab-ledger/server` or `pantry-ghost/server` |
| Runtime / Build / Start | Node / `npm install` / `npm start` |
| Health Check Path | `/api/health` |

Environment variables, per service:

```
DEMO_MODE=true
DEMO_PERSIST=true
TRUST_PROXY=true
MONGOMS_DISABLE_POSTINSTALL=1
MONGODB_URI=<your Atlas connection string>
MONGODB_DB_NAME=lab_ledger_demo          # crypt_kit_demo / pantry_ghost_demo for the other two
JWT_SECRET=<48+ random characters, different per service>
CLIENT_URL=https://<this app's Netlify site>.netlify.app
# optional email (Brevo) and owner account
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
MAIL_REPLY_TO=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=
```

- `DEMO_MODE` + `DEMO_PERSIST` keep the one-click demo accounts and store the demo data in Atlas. The server refuses to start in this mode unless `MONGODB_DB_NAME` ends in `_demo` or `_test`, so your real databases are never opened. Demo accounts cannot change or reset their password.
- `TRUST_PROXY=true` makes the rate limits count each visitor rather than Render's proxy.
- `MONGOMS_DISABLE_POSTINSTALL=1` skips downloading the in-memory MongoDB binary, which is not used here.
- `CLIENT_URL` has no trailing slash. It is used for CORS and email links.
- In Atlas > Network Access allow `0.0.0.0/0`, since Render's outgoing addresses change.
- Generate `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- After changing variables, redeploy (Manual Deploy > Deploy latest commit). The log should show `MongoDB connected: ... [db: <name>_demo]`.

**2. Client on Netlify.** Add a new site from this repo, once per app:

| Setting | Value |
|---|---|
| Base directory | `skeleton/client`, `lab-ledger/client` or `pantry-ghost/client` |
| Build command / publish directory | read from that folder's `netlify.toml` (`npm run build`, `dist`) |
| Environment variable `VITE_API_URL` | The Render URL plus `/api`, e.g. `https://lab-ledger.onrender.com/api` |

`VITE_API_URL` is built into the client, so redeploy the site after changing it (Clear cache and deploy site). Each `netlify.toml` also sends every path to `index.html`, so links like `/scan/LL-0001` and `/reset-password?token=...` open directly.

## Raise your own app

```bash
npm run summon -- my-app
```

Then add resource files in `my-app/server/src/resources/` and restart. See [`.kiro/specs/crypt-kit-skeleton/design.md`](.kiro/specs/crypt-kit-skeleton/design.md).

## License

[MIT](LICENSE)
