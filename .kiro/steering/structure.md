---
inclusion: always
---

# Structure Steering — Crypt Kit

The repo root holds three **independent** apps. Each is runnable on its own and has its own `client/` and `server/`.

```
skeleton/ | lab-ledger/ | pantry-ghost/
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── crypt.config.js          # appName, roles (ordered high→low), theme name, demo users
│   └── src/
│       ├── app.js               # Express app factory: helmet, CORS, JSON, routes, error handler
│       ├── server.js            # entry: env → DB → register resources → jobs → listen
│       ├── config/
│       │   ├── env.js           # validated, frozen env
│       │   └── db.js            # Mongoose connect (memory server in DEMO_MODE)
│       ├── core/                # ⚠ skeleton engine — same code in every app
│       │   ├── defineResource.js    # validates a definition, builds the Mongoose model
│       │   ├── registry.js          # resource registry (load all files in src/resources)
│       │   ├── permissions.js       # pure can(role, resource, action)
│       │   ├── statusFlow.js        # pure transition checks
│       │   └── intentRegistry.js    # voice intents: built-in + app-registered
│       ├── middleware/          # auth.js, requireRole.js, requirePermission.js, upload.js
│       ├── models/              # User.js, ActivityLog.js, Report.js + hand-written domain models
│       ├── routes/              # auth, meta, resources (generic), reports, dashboard, voice + domain routes
│       ├── controllers/         # thin: parse req → call service → send res
│       ├── services/            # business logic; throws errors with err.status
│       ├── resources/           # 👉 APP-SPECIFIC resource definitions (one file per resource)
│       ├── intents/             # 👉 APP-SPECIFIC voice intents
│       ├── jobs/                # cron jobs (overdue sweeper + app jobs)
│       ├── seed/                # demo data
│       └── utils/               # asyncHandler, httpError, pdfGenerator, pagination
│   └── uploads/reports/         # generated PDFs (git-ignored contents)
└── client/
    └── src/
        ├── main.jsx · App.jsx
        ├── api/                 # per-feature API functions (take an axios instance)
        ├── components/
        │   ├── ui/              # shadcn/ui primitives
        │   ├── layout/          # AppShell, Sidebar, Topbar
        │   └── resource/        # ResourceTable, ResourceForm, FieldInput, StatusBadge, ActivityTimeline
        ├── pages/               # Login, Dashboard, ResourceList, ResourceDetail, Reports, VoiceAgent + app pages
        ├── hooks/               # useApi, useAuth, useMeta, usePermission, useRecorder
        ├── context/             # AuthContext, MetaContext
        ├── theme/               # tokens.css + theme.js (per app)
        └── lib/                 # utils, can.js (mirror of server permissions)
```

## Where code goes

- **New domain entity with plain CRUD:** add one file in `server/src/resources/`. Write no model, route or page.
- **Domain logic beyond CRUD** (checkout, FEFO picking): add a hand-written `models/` (if needed), `services/`, `controllers/` and `routes/` file following the layer pattern, plus a page in `client/src/pages/`.
- **New voice question:** add a file in `server/src/intents/`.
- **Changes to `core/`** must be made in `skeleton/` first, then copied to both apps. The `sync-core` hook reminds you.

## Naming

- Files: `camelCase.js` for modules and `PascalCase.jsx` for React components and Mongoose models.
- Resource keys: lowercase plural kebab-case (`equipment`, `stock-lots`). The API path is `/api/r/:key`.
- Roles: PascalCase strings defined in `crypt.config.js`.
- Tests sit next to the code they test: `foo.test.js`, and `foo.property.test.js` for fast-check suites.
