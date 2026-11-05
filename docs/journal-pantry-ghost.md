# Pantry Ghost build journal

> **Disclosure:** Pantry Ghost was implemented by a **Claude Code subagent**. It followed the Kiro spec in `.kiro/specs/pantry-ghost/` (requirements, design, tasks) and the steering docs in `.kiro/steering/`, working task by task Kiro-style. Before starting each task it flipped the checkbox to in progress with `scripts/task.sh`, and it ticked the box only after the tests passed. Kiro itself did not execute these tasks, and no Kiro execution records were created.

## 2026-11-05

### Task 1: Summon and configure
- Set `crypt.config.js`:
  - roles `Coordinator` (superuser), `Volunteer` and `Board`
  - theme `lantern`
  - organization "Crypt Kit Community Food Bank"
  - three demo users `*@pantry.test`
- **1.3, skeleton suites unchanged:** they hard-code the skeleton's role names (Admin, Member, Viewer). The Core test `defineResource.property.test.js` also imports the example `resources/notes.js`, which the app deletes. Neither file may be edited, so `server/package.json` now has two Jest projects:
  - **skeleton** runs the skeleton suites byte-for-byte unchanged. `moduleNameMapper` points `crypt.config.js` at `test/fixtures/skeleton/crypt.config.js` and points `../resources/notes.js` at a fixture copy.
  - **pantry** runs every app suite against the real config.
  - Result: 16 suites and 68 tests green before any app code existed.
- **1.2, lantern tokens:** warm charcoal background, pumpkin primary and candle accent, plus a light variant. All 24 pairs in `tokens.contrast.test.js` are at least 4.5:1. The `Logo` is now a ghost holding a lantern. The favicon, the `index.html` title and description, and the default empty-state copy were updated too.

### Task 2: Pure domain functions (`server/src/domain/`)
- Wrote `classifyExpiry`, `expiryWindows`, `numberWords`, `dateWords`, `categoryKeywords`, `parseIntake` and `planFefo`, plus the pure helpers `dates` and `spoken`. Every function takes `now` as a parameter and never reads the clock.
- **P3** (FEFO, 200 runs), **P4** (expiry total and monotonic, 3 × 100 runs) and **P5** (intake round trip, 300 runs) all pass. P5 uses `test/generators/intake.js`, which has 5 sentence templates, numerals or number words, unit synonyms, 6 date forms with an independent year-rollover oracle, donor names with up to 2 letter typos, and random upper case.
- **fast-check counterexample 1 (P5):** an extra 20,000-run hunt shrank to `"LOG FROM NORTHGATE SCHOOL GOOD DRIVE, 2 POUNDS OF MILK, USE BY IN SIX DAYS"`.
  - Cause: the typo turned "food" into "good", and the donor phrase stopped at the first word of the date marker "good until".
  - Fix: the counterexample was pasted into `parseIntake.test.js` and seen failing first. The donor scan now stops only at a complete marker.
  - Check: 60,000 further runs found no counterexample.

### Task 3: Resources
- Wrote the `donors`, `stock-lots`, `households` and `distributions` resources. Refs use resource keys.
- **stock-lots:**
  - hooks classify `status` on create, and again on update when quantity, expiry or category changes
  - `ExpiringSoon`, `Expired` and `Depleted` are workflow-only
  - delete soft-deletes to `Discarded`
  - `receivedQuantity` is added with `extendSchema` plus a `pre('validate')` hook, so the impact report still knows what arrived after distributions draw the lot down
- **households:**
  - `code` (H-0001…) is generated in `beforeCreate` inside the transaction
  - `beforeUpdate` drops any attempt to change the code
- **distributions:**
  - `lines` is a sub-document array added with `extendSchema`
  - generic create and update are denied by hooks, and generic delete by a Mongoose `findOneAndDelete` guard, so even the superuser Coordinator cannot hand-edit them
- **P6** (household privacy, 2 × 25 DB runs): any create or update body stores only code, size, dietary and system fields. For Board, meta, `/r/households`, `/r/distributions`, the dashboard and 10 voice questions contain no `H-\d{4}`. The impact PDF text is checked as well, through a small PDF text extractor with a positive control.

### Task 4: Expiry job and dashboard panels
- `jobs/app/classifyExpiry.job.js` runs hourly and at boot. Changes are conditional on the old status, and each one gets a `status` Activity entry from `system`.
- Server panels `useFirst` and `thisMonth` have matching client renderers. On the Use first board, the glow grows as expiry nears, and the pulse is motion-safe only.

### Task 5: Intake
- `POST /api/intake/parse` returns a draft only. `POST /api/intake` validates every lot before writing any, then creates each one through `resourceService.create`, so hooks and activity run as normal.
- `/intake` page:
  - a mic button (`useDictation`, which wraps the skeleton's `useSpeech`/`useRecorder` and uses Whisper through `/voice/query` when OpenAI is configured)
  - a text box
  - editable `DraftRow`s with an ember outline and "The ghost didn't catch …" hints
  - "Save all" stays blocked until every draft is complete

### Task 6: FEFO distribution
- `distributionService.plan` re-classifies lots against `now` before calling `planFefo`. It returns the lines enriched with location, cold storage first.
- `commit` runs in one transaction. Each line is a conditional `findOneAndUpdate` (`quantity ≥ n`, a pickable status, not past expiry). Any short line throws 409 `{ short }`, which aborts the whole transaction. Lots that reach 0 become `Depleted`.
- **P1:** 25 runs of 2–6 concurrent `Promise.all` commits against the memory replica set. Stock never goes negative, and received − remaining equals distributed for every lot.
- **P2:** 25 runs. An over-asking line anywhere in the list leaves lots, statuses, distributions and activity untouched.
- `/distribute` is a 3-step stepper:
  - `HouseholdPicker`: search by code, or register a new household with size and dietary flags only
  - `ItemChips`: dietary warnings
  - `PickList`: lines grouped Fridge → Freezer → Shelf, tick-off checkboxes, and Confirm blocked while anything is short, with a "Use what we have" option

### Task 7: Checkpoint
- The full loop works over HTTP in the integration test and the smoke test: intake parse → save → plan → commit → stock decremented. It was also walked by hand in a browser at 375 px.

### Task 8: Voice
- New intents: `INTAKE` (draft only, never saves; Board is refused politely), `EXPIRING_THIS_WEEK`, `STOCK_OF` and `HOUSEHOLDS_SERVED` (`aggregateOnly`, which Board may ask). `STOCK_OF` leaves phrases that name another resource to the built-in intents.
- `client/src/voice/INTAKE.jsx` shows a confirm card. "Confirm & save" or a spoken "confirm" saves; there are also "Edit on intake page" (passes the draft through router state) and Discard. `EXPIRING_THIS_WEEK.jsx` lists the spoken lots.

### Task 9: Impact report
- `impactService.aggregate` computes:
  - units received and distributed by category
  - distinct households and the people reached
  - the waste rate
  - the top 5 donors
  - weekly buckets
- `generate` draws the PDF with the skeleton's `createReport` helpers (`heading`, `kv`, `table`, `barChart`, `text`) and lists it as a `stock-lots` report.
- Routes: `POST /api/reports/impact` and `GET /api/reports/impact/preview`, for Coordinator and Board.
- 9.2: a dedicated `/impact` page with a month picker, preview stats, a chart and a download. Two report presets were added for the Reports page.

### Task 10: Seed and README
- `seed/pantry.seed.js` is a deterministic simulation (mulberry32 PRNG):
  - 12 donors, 120 lots over 60 days and 45 households
  - 150 distributions planned in time order with the real `planFefo`
  - final lot quantities and statuses precomputed, with 5 expired lots discarded
- The ids are pre-generated because the skeleton seeder does not guarantee that stock-lots are seeded before distributions (`lines.lot` is not a declared ref).
- The integration test checks that received − distributed = quantity for all 120 lots.
- `pantry-ghost/README.md` was rewritten.

### Task 11: Final checkpoint and test counts
| Suite | Result |
|---|---|
| server (Jest, 2 projects) | 25 suites, 136 tests: skeleton 16/68, pantry 9/68 |
| client (Vitest) | 4 files, 39 tests |
| smoke (`SMOKE_PORT=5062`) | 30/30 checks |
| `vite build` | succeeds |
| `node scripts/check-core.js` | Core identical (27 files) |

60-second demo path: speak "add twelve cans of black beans expiring March 3rd from Fresh Mart" on `/intake` → Save all → ask "what expires this week?" on `/voice` → `/distribute` (H-0001, Dairy ×2, Dry, Canned) → Confirm → `/impact` → Generate PDF.

## Bugs found along the way
- **The P5 counterexample above:** the donor phrase was cut short by a partial date marker.
- **The test PDF extractor skipped every other stream:** the regex for `stream` also matched the end of `endstream`. Caught by the "DISTRIBUTIONS PER WEEK" assertion and fixed in `test/pantry.js`.
- **Jest `testMatch` brace globs (`{a,b}`) did not match on Windows** and silently dropped the service suites. Replaced with one pattern per suite.
- **`"expiring soon"` leaked "soon" into the item name.** Marker tokens are now consumed even when no date follows, and "soon" is a filler word.

## Deviations and Core gaps
- **Skeleton tests depend on skeleton-only names.** They expect the role names (Admin, Member, Viewer) and the `notes` example, so apps need the two-project Jest setup. Making those suites config-driven in `/skeleton` would remove the need for it.
- **No `beforeDelete` hook.** A Mongoose query guard in `extendSchema` stands in for it.
- **Superuser bypasses permissions.** The generic UI still shows "New distribution" to the Coordinator, and the server refuses with 403.
- **No custom detail panel extension point.** Distribution lines are not shown on the generic detail page. A declared `summary` field ("7 units for H-0001 — Canned 7") carries the gist.
- **Waste is computed from lot state, not from activity entries** as the design suggested. The waste is lots `Expired` with expiry in the month plus lots `Discarded` in the month. Seeded data has no status history, so activity-based waste would read 0.
- **Task 9.2:** the month picker is a dedicated `/impact` page rather than part of the Reports page. The Reports page belongs to the skeleton, and its presets can only target the generic report endpoint.
