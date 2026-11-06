# How We Used Kiro: Crypt Kit (Kiroween 2026, Skeleton Crew)

> This is a working draft of the Devpost write-up. Fill in each section from real experience as you build. The `kiro-usage-journal` hook appends to the build journal at the bottom.
>
> **Disclosure (keep this in the submission):** the specs, steering docs and hooks were written for Kiro. The code was then implemented task by task with Claude Code, following `tasks.md` the way Kiro executes specs: `[-]` while a task is in progress, `[x]` when done, tests at every checkpoint. The two apps were built in parallel by two Claude Code subagents, one per spec. Sections below marked _(fill in)_ should describe your own Kiro runs. Only claim Kiro features (hooks firing, MCP, Crew) that you actually used in Kiro.
>
> Detailed journals: [skeleton (below)](#build-journal) · [Lab Ledger](journal-lab-ledger.md) · [Pantry Ghost](journal-pantry-ghost.md)

## Results at a glance

| | Server tests | Client tests | Smoke (HTTP) | Core drift |
|---|---|---|---|---|
| Skeleton | 76 | 35 | 31/31 | — |
| Lab Ledger | 125 (74 core + 51 app) | 47 | 40/40 | identical |
| Pantry Ghost | 142 (74 core + 68 app) | 43 | 30/30 | identical |
| Summon script | 5 (`node:test`) | | | `npm run check:core` ✔ |

The core, server middleware, generic UI components, the shared Jest config and the core test fixtures are byte-identical in all three apps: 31 files, checked by hash.

## Kiro surfaces used
- **Kiro IDE:** _which parts (spec execution, hooks, chat)_
- **Kiro CLI / Web / Crew:** _if tried: how they differed; whether Crew agents ran the skeleton and app specs in parallel_

## Spec-driven development
- Three specs: `crypt-kit-skeleton`, `lab-ledger` and `pantry-ghost`. The app specs reference skeleton requirements and add **Extension Points** (skeleton Req 16) whenever an app needed something Core lacked, instead of patching Core.
- Every task links back to acceptance criteria (`_Requirements: x.y_`). The `spec-trace` hook audits for gaps.
- Each spec has a task dependency graph, so independent waves could run in parallel.
- _Compare with vibe coding: what the spec prevented (e.g. the prototype's error handler turned every service 404 into a 500, which skeleton Property 11 now guards)._

## Steering
- `product.md`, `tech.md` and `structure.md` are always included. `server-conventions.md`, `client-conventions.md` and `testing.md` are file-matched.
- _Which rule changed Kiro's output the most?_

## Agent hooks
| Hook | Trigger | What it automated | What it caught |
|---|---|---|---|
| Run related tests on save | server file edited | `jest --findRelatedTests` | _…_ |
| Sync skeleton core to apps | core file edited | copies Core into both apps and runs their tests | _…_ |
| New resource checklist | resource file created | validates the definition, seeds data, updates the README | _…_ |
| Accessibility & theme check | `.jsx` edited | aria labels, tokens, 375px layout | _…_ |
| Spec traceability audit | manual | finds uncovered criteria and properties | _…_ |
| Update Kiro usage write-up | manual | appends to this file | _…_ |

## MCP
- **MongoDB MCP (read-only):** _inspect seeded data, verify aggregations for the dashboard and impact report_
- **Playwright MCP:** _check 375px/1440px layouts, run the demo flow end to end_

## Property-based testing
- Skeleton: 21 properties. Lab Ledger: 6 (L1–L6). Pantry Ghost: 6 (P1–P6). Each one is a `fast-check` suite headed `// Property N:` / `// Validates: Requirements …`.
- **Real bug found:** Pantry Ghost P5 (intake parser round trip). A typo'd donor name ("food" → "good") made the parser stop early at the "good until" date marker. The parser now stops only at a complete marker, and the shrunk case is kept as a unit test. (`docs/journal-pantry-ghost.md`)
- **Model-based testing:** Lab Ledger L1 uses `fc.commands` to drive request, approve (including concurrent double approval), return, reject, cancel and sweep, checking the "at most one active loan per item" invariant after every step.
  - Deliberately breaking the return rule made L1 fail at once, with the shrunk sequence `[request, approve, return(Damaged)]`.
  - Removing the availability check did *not* fail L1, because the partial unique index (the designed second guard) still blocked the double loan.
- **Test-only counterexamples** (kept as regression tests):
  - L5 `[["aaa"],0,"aaa"]`: the test prefixed "who has the", but "who" and "has" are not stop-words.
  - A Mongoose `$in` cast on a Mixed path double-counted activity entries.
- **Guard against a known bug:** skeleton Property 11 encodes the bug from the earlier prototype (service 404s returned as 500s) and checks every 400–599 status.

## Kiro powers
- _Which powers were used, and what they added_

## Build journal
<!-- kiro-usage-journal hook appends below -->

### 2026-11-05: skeleton server, tasks 1–7 (implemented with Claude Code, following the Kiro task list)
- Ran skeleton tasks 1–7 in order: each task was marked `[-]` while in progress and `[x]` when done. Stopped at checkpoints 3 and 7 to run `npm test` and `npm run smoke`.
- Prototype bug fixed as a spec requirement: the error handler now honours `err.status` (Req 12.2). Property 11 plus a regression test guard it.
- 47 Jest tests (10 suites) cover Properties 1–13, 18 and 19. No counterexamples yet; every property passed on its first run. The smoke script hits 27 HTTP checks against a demo-mode server.
- New extension behaviour found while implementing: generic CREATE must also reject workflow-only statuses, and hook-returned data must be re-sanitized. Both are covered by Property 19 and the hook tests.
- Still pending: the `jobs/app` loader (part of 6.4), which arrives with the sweeper in task 8.

### 2026-11-05: skeleton server, tasks 8–12 (Claude Code, following the Kiro task list)
- Tasks 8–11: the overdue sweeper and job loader (finishing 6.4), PDF reports (`PdfBuilder` with table, kv, heading and barChart helpers for custom reports), and the voice backend: an intent registry, built-in intents for every resource, OpenAI speech behind a lazy client, and a browser fallback. Also the seed, with per-resource data files and generic placeholders for resources that have none.
- Checkpoint 12: 67 Jest tests (16 suites) and 32 HTTP smoke checks pass with no `OPENAI_API_KEY`.
- Properties 12, 14, 16 and 17 were added. The only failure was a wrong regex in a test assertion, not a code bug.
- UX gap found at the checkpoint: the generated voice example "how many notes are low" read badly. Built-in intents now accept field-named phrasings ("how many high priority notes"), and Property 14's generator now covers them.

### 2026-11-05: report style change requested by the team
- The team shared an existing operations "Exception Maintenance Report" PDF as the target style. The spec (skeleton Req 10.2 and design § PDF Generator) was updated first, then `PdfBuilder` was rebuilt to match: a grid table with a navy header repeated per page, a Sl No column, a "Generated on" timestamp in the configured time zone, an organization meta line, link sub-lines, a duration column, and an `APP - TITLE / Page x of y` footer.
- A visual check found that equal-weight columns broke codes like `WO-1201`. Widths are now measured from the text, so each column fits its longest word and dates and durations stay on one line.

### 2026-11-05: skeleton client, tasks 13–15 (Claude Code, following the Kiro task list)
- React + Vite + Tailwind client with token-based "Crypt" theming (dark by default, light toggle, reduced-motion support). Everything is driven by `/api/meta`: sidebar, list/filters/search, create/edit forms, detail page with status-transition buttons, activity timeline, reports page, voice agent (OpenAI recorder, browser speech, typed fallback) and Superuser user management.
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
