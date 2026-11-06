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
| Skeleton | 76 | 35 | 31 checks |
| Lab Ledger | 125 | 47 | 40 checks |
| Pantry Ghost | 142 | 43 | 30 checks |

The tests include 33 property-based correctness properties (`fast-check`), each linked to spec requirements. See [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md).

## Raise your own app

```bash
npm run summon -- my-app
```

Then add resource files in `my-app/server/src/resources/` and restart. See [`.kiro/specs/crypt-kit-skeleton/design.md`](.kiro/specs/crypt-kit-skeleton/design.md).

## License

[MIT](LICENSE)
