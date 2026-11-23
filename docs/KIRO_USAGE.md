# How We Used Kiro: Crypt Kit (Kiroween 2026, Skeleton Crew)

> **Read this before submitting.** Every claim below is either visible in this repository or describes work done in the Kiro IDE chat. Spots marked `TODO(owner)` in the source of this file are things only you can say (what you ran in Kiro and what it did for you). Fill them in or delete the sentence around them; do not leave a claim you cannot stand behind. The remaining owner tasks are in [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md).
>
> **Disclosure (keep this in the submission):** the specs, steering docs and hooks were written for Kiro. The first release of the code was then implemented task by task with Claude Code, following `tasks.md` the way Kiro executes specs: `[-]` while a task is in progress, `[x]` when done, tests at every checkpoint. The two apps were built in parallel by two Claude Code subagents, one per spec. Everything listed under [After the first release](#after-the-first-release-built-in-the-kiro-ide) was done in the Kiro IDE agent chat.
>
> Detailed journals: [skeleton (below)](#build-journal) · [Lab Ledger](journal-lab-ledger.md) · [Pantry Ghost](journal-pantry-ghost.md)

<!-- TODO(owner): if you ran any of the spec tasks, hooks or MCP servers yourself in Kiro, say so in one line here and keep the disclosure above accurate. -->

## Results at a glance

| | Server tests | Client tests | Smoke (HTTP) | Real-browser steps | Core drift |
|---|---|---|---|---|---|
| Crypt Kit (skeleton) | 281 | 208 | 31/31 | 72 | — |
| Lab Ledger | 335 | 214 | 40/40 | 60 | identical |
| Pantry Ghost | 348 | 208 | 30/30 | 51 | identical |

Also run on all three: an installability check on the production build (8 steps each), a dark and light audit of every page (about 130 to 160 screens each), a five-width responsive audit (about 100 screens each) and a read-only check of the live sites (36 steps). Summon script: 5 tests (`node:test`).

The core, server middleware, generic UI components, the shared Jest config and the core test fixtures are byte-identical in all three apps: 47 files, checked by hash (`npm run check:core`).

## Kiro surfaces used

- **Kiro IDE (agent chat):** all work in [After the first release](#after-the-first-release-built-in-the-kiro-ide).
- **Specs:** four, in `.kiro/specs/` (see below).
- **Steering, hooks, MCP:** configured in `.kiro/` (see below).
- **Sub-agents:** used for parallel feature work (see below).
- **Kiro CLI / Web / Crew:** not used for this project. <!-- TODO(owner): change this line only if you did use them. -->

## Spec-driven development

- Four specs: `crypt-kit-skeleton` (85 tasks), `lab-ledger` (35), `pantry-ghost` (37) and `field-ready` (the installable app, the tour and the assistant check). The app specs reference skeleton requirements and add **Extension Points** (skeleton Req 16) whenever an app needed something Core lacked, instead of patching Core.
- Every task links back to acceptance criteria (`_Requirements: x.y_`). The `spec-trace` hook audits for gaps. Each spec has a task dependency graph, so independent waves can run in parallel.
- `field-ready` was written first, then built, in the Kiro IDE. Its acceptance criteria turned directly into tests. For example "the service worker never caches an API request" became a test that loads `sw.js` into a fake worker scope and fires fetch events at it; the same test file found that the build stamp only replaced the first of two placeholders, which would have left every deploy with the same cache name.
- **Compared with vibe coding.** Two places where a written requirement changed the outcome: the prototype's error handler turned every service 404 into a 500, which skeleton Property 11 now guards; and the rule "the assistant can only read what the asker may read" was a requirement before it was code, so the query engine has one permission check that the rule-based parser and the optional model both pass through, instead of a check bolted on later.
- <!-- TODO(owner): one honest sentence on where the spec-driven way cost you time or did not fit. -->

## Steering

- `product.md`, `tech.md` and `structure.md` are always included (`inclusion: always`). `server-conventions.md`, `client-conventions.md` and `testing.md` load only for matching files (`fileMatch`).
- <!-- TODO(owner): which rule changed the agent's output the most? e.g. the testing rule that every fast-check counterexample is copied into a plain unit test (several of those are kept in the suites). -->

## Agent hooks

Six hooks in `.kiro/hooks/`, all enabled:

| Hook | Trigger | What it does |
|---|---|---|
| Run related tests on save | a server source file is edited | runs `jest --findRelatedTests` for that file in its app and fixes the cause, not the test |
| Sync skeleton core to apps | a Core file is edited | copies Core to both apps and runs their tests |
| New resource checklist | a resource file is created | validates the definition, seeds data, updates the README |
| Accessibility & theme check | a `.jsx` file is edited | aria labels, theme tokens only, 375 px layout |
| Spec traceability audit | manual | finds acceptance criteria and properties with no task or test |
| Update Kiro usage write-up | manual | appends to the build journal below |

<!-- TODO(owner): which hooks actually fired for you, and what did one catch? Delete the "what it does" column entries for any hook you never saw run. -->

## MCP

Two servers are configured in `.kiro/settings/mcp.json`: **MongoDB** (read-only) and **Playwright**.

<!-- TODO(owner): what did you use them for, if anything? Note: the MongoDB entry points at mongodb://localhost:27017/crypt-kit, which only exists if you run a local MongoDB; the apps themselves use an in-memory database in demo mode. Fix or remove the entry before submitting. -->

The real-browser suites in `e2e/` use `playwright-core` directly rather than the MCP server.

## Sub-agents

For the largest batch of features (clickable rows, sorting, board and calendar views, comments, subtasks, search, duplicate, the UI polish, and the server side for checklists, comments, search and date ranges) the work was split across four parallel sub-agents. Each got a written brief with: the files it owned (and the ones it must not touch), the API contracts the others were building against, the test commands and the rule that only the coordinator syncs changes to the other two apps. Two of the four ran out of their time limit before reporting; their changes were already on disk, so the coordinating session read the code and tests, wrote a narrower follow-up brief for the missing server tests, and verified everything itself. Nothing was merged without a green suite.

## Property-based testing

- Skeleton: 21 properties. Lab Ledger: 6 (L1–L6). Pantry Ghost: 6 (P1–P6). Each is a `fast-check` suite headed `// Property N:` / `// Validates: Requirements …`.
- **Real bug found:** Pantry Ghost P5 (intake parser round trip). A typo'd donor name ("food" → "good") made the parser stop early at the "good until" date marker. The parser now stops only at a complete marker, and the shrunk case is kept as a unit test. (`docs/journal-pantry-ghost.md`)
- **Model-based testing:** Lab Ledger L1 uses `fc.commands` to drive request, approve (including concurrent double approval), return, reject, cancel and sweep, checking the "at most one active loan per item" invariant after every step.
  - Deliberately breaking the return rule made L1 fail at once, with the shrunk sequence `[request, approve, return(Damaged)]`.
  - Removing the availability check did *not* fail L1, because the partial unique index (the designed second guard) still blocked the double loan.
- **Test-only counterexamples** (kept as regression tests): L5 `[["aaa"],0,"aaa"]`; a Mongoose `$in` cast on a Mixed path that double-counted activity entries.
- **Guard against a known bug:** skeleton Property 11 encodes the bug from the earlier prototype (service 404s returned as 500s) and checks every 400–599 status.
- Permission rules are tested as properties too: "a role that cannot read a resource is refused and no query runs" holds for any generated resources and roles, for the voice answers and now for the general chat questions.

## After the first release (built in the Kiro IDE)

Work done in Kiro IDE agent sessions after the first release, in the order it happened. Each item ships with tests; the counts are in the table at the top.

- **Accounts and mail:** sign-up with approval, forgot and reset password, change password, show/hide password, sign-out confirmation, SMTP notifications (Brevo) with reserved test domains skipped.
- **Data tools:** CSV export and import (dry run first), saved views, OpenAPI docs, QR codes with short IDs, a scan or find page (camera, photo, typed ID), label sheets, themed PDFs.
- **Hosting:** demo mode on a persistent database guarded by name (`_demo` or `_test` only, so a real database is never opened), proxy-aware rate limits, Netlify and Render deployment, a read-only check of the live sites.
- **List and detail UX:** clickable rows, sortable columns (case-insensitive), board and calendar views, a Mine filter, subtasks, comments, duplicate, global search (Ctrl+K), UI polish.
- **Crypt Kit as a to-do suite:** Projects, Reminders, Goals (progress derived from milestones, not typed) and a Time log.
- **Chat assistant:** a permission-checked query engine, a rule-based question parser (dates in the asker's timezone), lookup by ID, an overview, drafts with Confirm for commands, and answers read aloud in the best natural voice the device offers.
- **Quality passes:** a dark and light audit of every page, a five-width responsive audit (found a 27 px overflow on 320 px phones and tap targets under 24 px, both fixed), an installability check on the production build.
- **Field-ready (spec first):** installable apps with their own icons, an offline shell that never caches API data, a first-run tour, an assistant check script.

Bugs found by these checks and fixed, with the test that now guards each: a service-worker cache name that never changed between deploys; text sorted by byte value ("Zebra" before "apple"); a confirm card that kept the previous command's "Done" state; comment text copied into the history (so a deleted comment lived on); badge text below WCAG AA contrast in both themes; a top bar too wide for a 320 px phone.

## Kiro powers

<!-- TODO(owner): none were used in this repository's build. Delete this section, or add what you used. -->
None used.

## Build journal
<!-- kiro-usage-journal hook appends below -->

### 2026-11-05: skeleton server, tasks 1–7 (implemented with Claude Code, following the Kiro task list)
- Ran skeleton tasks 1–7 in order: each task was marked `[-]` while in progress and `[x]` when done. Stopped at checkpoints 3 and 7 to run `npm test` and `npm run smoke`.
- Prototype bug fixed as a spec requirement: the error handler now honours `err.status` (Req 12.2). Property 11 plus a regression test guard it.
- 47 Jest tests (10 suites) cover Properties 1–13, 18 and 19. No counterexamples yet; every property passed on its first run. The smoke script hits 27 HTTP checks against a demo-mode server.
- New extension behaviour found while implementing: generic CREATE must also reject workflow-only statuses, and hook-returned data must be re-sanitized. Both are covered by Property 19 and the hook tests.
- Still pending: the `jobs/app` loader (part of 6.4), which arrives with the sweeper in task 8.

### 2026-11-05: skeleton server, tasks 8–12 (Claude Code, following the Kiro task list)
- Tasks 8–11: the overdue sweeper and job loader (finishing 6.4), PDF reports (`PdfBuilder` with table, kv, heading and barChart helpers for custom reports), and the voice backend: an intent registry, built-in intents for every resource, a speech wrapper (OpenAI at the time, later removed in favour of the browser voice). Also the seed, with per-resource data files and generic placeholders for resources that have none.
- Checkpoint 12: 67 Jest tests (16 suites) and 32 HTTP smoke checks pass with no speech keys.
- Properties 12, 14, 16 and 17 were added. The only failure was a wrong regex in a test assertion, not a code bug.
- UX gap found at the checkpoint: the generated voice example "how many notes are low" read badly. Built-in intents now accept field-named phrasings ("how many high priority notes"), and Property 14's generator now covers them.

### 2026-11-05: report style change requested by the team
- The team shared an existing operations "Exception Maintenance Report" PDF as the target style. The spec (skeleton Req 10.2 and design § PDF Generator) was updated first, then `PdfBuilder` was rebuilt to match: a grid table with a navy header repeated per page, a Sl No column, a "Generated on" timestamp in the configured time zone, an organization meta line, link sub-lines, a duration column, and an `APP - TITLE / Page x of y` footer.
- A visual check found that equal-weight columns broke codes like `WO-1201`. Widths are now measured from the text, so each column fits its longest word and dates and durations stay on one line.

### 2026-11-05: skeleton client, tasks 13–15 (Claude Code, following the Kiro task list)
- React + Vite + Tailwind client with token-based "Crypt" theming (dark by default, light toggle, reduced-motion support). Everything is driven by `/api/meta`: sidebar, list/filters/search, create/edit forms, detail page with status-transition buttons, activity timeline, reports page, voice agent (browser speech, typed fallback) and Superuser user management.
- Tests: Property 15 (client `can` vs server `can`, 500 runs), UI tests for the route guard, Viewer hiding, Member partial access and voice error display, plus 24 automated WCAG AA contrast checks over the theme tokens (all pass).
- The checkpoint 15 browser walkthrough at 1440px and 375px found and fixed 5 bugs:
  1. `/users` redirected away on a direct visit, because the Superuser check ran before meta loaded.
  2. "Needs attention" labels collapsed to zero width.
  3. Status changes appeared twice in the history.
  4. Singular voice answers read badly ("There is 1 overdue notes").
  5. Speech could stay stuck on "Speaking" when the browser never fires `onend`.
- Two environment fixes: `.env` and the cached mongod binary now load relative to the server package, so `npm --prefix` from the repo root no longer triggers a 600 MB re-download. The client bundle went from 1.5 MB to about 380 kB by loading lucide icons on demand.

### 2026-11-05: skeleton tasks 16–17 and summoning both apps
- `scripts/summon.js` copies the skeleton while skipping node_modules, dist, .env files and generated PDFs, renames the app and refuses to overwrite a non-empty folder. It has 5 `node:test` tests.
- `scripts/check-core.js` hashes every Core file (core/, middleware/, components/resource/, lib/can.js) and fails if an app drifts from the skeleton. It turns the "Core stays identical" requirement and the `sync-core` hook into a check that can be run.
- The skeleton is complete: 70 server tests, 31 client tests and 32 smoke checks pass. `npm run summon -- lab-ledger` and `npm run summon -- pantry-ghost` raised both apps. The two app specs then ran in parallel as separate agents, one per app folder.

### 2026-11-05: both apps built in parallel, then verified
- Two subagents ran the `lab-ledger` and `pantry-ghost` specs at the same time, each confined to its own folder, spec and journal. Every task in both specs, the optional property tests included, ended `[x]`.
- An independent re-run after hand-back passed:
  - Lab Ledger: 119 server tests, 43 client tests, 40/40 smoke checks
  - Pantry Ghost: 136 server tests, 39 client tests, 30/30 smoke checks
  - Both clients build, and `check-core` passes
  - Browser walkthrough of both apps: dashboards, Lab voice WHO_HAS (including the typo "osciloscope"), Pantry intake parse "twelve cans of black beans expiring March third from Fresh Mart" → `{ quantity: 12, unit: can, category: Canned, expiresOn: 2027-03-03, donor: Fresh Mart }`
- Skeleton gaps the apps uncovered (they were worked around in app code; Core was not edited):
  - The skeleton test suites hard-code the skeleton's roles and app name, so each app runs them through a Jest "core" project with fixture config.
  - There is no `beforeDelete` hook (both apps used `extendSchema` middleware instead).
  - Hook `ctx.now` is the wall clock, so it cannot be injected in tests.
  - There is no detail-panel extension point.
  - The generic list page has no row selection.
  - The superuser sees a generic "New" button on workflow-only resources.

### 2026-11-06: skeleton task 18, closing the gaps the apps found
- The spec came first: skeleton requirements 16.10–16.15, Properties 20 and 21, and task 18, all written before any code.
- **Delete hooks:** `beforeDelete` and `afterDelete` run in the delete transaction for soft and hard deletes. Lab Ledger's two Mongoose middleware guards (no deleting an out loan, no retiring a checked-out item) became `beforeDelete` hooks.
- **Injectable clock:** `clock` in the runtime context drives hook `ctx.now`, soft-delete timestamps, the sweeper, voice and the dashboard. A test injects 31 Oct 2031 and sees it everywhere.
- **`genericDisabled`:** generic routes answer 405 for every role, and meta reports those actions as not permitted. Pantry Ghost distributions dropped their deny hooks and delete guard, and the Coordinator no longer sees a dead "New" button.
- **Client extension points:**
  - `client/src/detail/<key>.jsx` panels. Pantry Ghost now shows the packed lines of a distribution, grouped by location.
  - `bulkActions` with row selection on the list page. Lab Ledger's separate "Print labels" page became an "Print labels" bulk action on the Equipment list.
- **Shared Jest config:** a Core `jest.config.js` with `core`/`app` projects and frozen fixtures in `test/core/`. Both apps deleted their custom Jest setups. Making the ignore patterns work with Windows path separators fixed core suites that had been running twice.
- **Regressions this caught:** both apps' old delete guards had hooked `findOneAndDelete`, which the new transactional delete no longer calls. Their tests caught it straight away (an out loan could be deleted, and a distribution could be deleted), and the guards were moved to the new extension points.
- **Results:**
  - Skeleton: 76 server, 35 client, 31/31 smoke
  - Lab Ledger: 125, 47, 40/40
  - Pantry Ghost: 142, 43, 30/30
  - `check-core`: 31 identical files
  - Browser checks: Lab bulk label printing, and the Pantry Coordinator view of distributions (no New/Edit/Delete; packed-lines panel)
- **Correction:** the skeleton smoke script has 31 checks, not the 32 reported earlier; the 32 counted the helper's definition.
