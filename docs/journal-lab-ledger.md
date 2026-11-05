# Lab Ledger build journal

Lab Ledger was implemented by a **Claude Code subagent** working Kiro-style from the spec in `.kiro/specs/lab-ledger/` (requirements, design, tasks), the skeleton spec's extension points (Requirement 16) and the steering docs in `.kiro/steering/`. Before each task it ran `scripts/task.sh lab-ledger - <ids>`, and after the task was tested it ran `scripts/task.sh lab-ledger x <ids>`. No Core file was edited: `node scripts/check-core.js` passes (27 files identical across skeleton, lab-ledger and pantry-ghost).

## 2026-11-05

### Task group 1: summon and configure (1.2, 1.3)
- `crypt.config.js`: roles `LabManager / Technician / Student`, theme `mad-lab`, 3 demo users (`*@lab.test`), report organisation "Crypt Kit University — Science Labs".
- Theme `mad-lab`: dark slate (`222 30% 9%`), flask green primary (`142 72% 45%`), potion purple accent (`280 60% 60%`), and a light variant. All 24 WCAG pairs in `tokens.contrast.test.js` are ≥ 4.5:1. Beaker-with-bubbles `Logo` and favicon. The voice orb became a beaker with a face. The display font is Space Grotesk.
- **Problem found:** the skeleton suites hard-code skeleton defaults ("Crypt Kit", roles Admin/Member/Viewer), and one Core suite imports `../resources/notes.js`. With the Lab config, 1 test failed immediately and more broke later. **Fix without touching Core:** `jest.config.js` now defines two projects. `core` runs the 16 skeleton suites unchanged, with `crypt.config.js` mapped to `test/skeleton.crypt.config.js` (a verbatim copy), `notes.js` mapped to a fixture copy, and `routes/app/*.js` mapped to an empty router (as in `/skeleton`). `app` runs the Lab suites against the real config.

### Task group 2: resources (2.1–2.3)
- `labs`, `equipment` (CheckedOut workflow-only, due rule on `nextCalibration`, soft delete to Retired), `calibrations` and `checkouts`. Refs use resource keys (`ref: 'labs'`, `ref: 'equipment'`).
- `checkouts`: every status is workflow-only, generic writes are LabManager-only, and `extendSchema` adds the partial unique index `{ equipment: 1 }` where status is Active or Overdue.
- **Gaps closed in app code.** A generic soft DELETE bypasses the status-flow check, so a LabManager could have retired a CheckedOut item. A hard DELETE of an out loan would have orphaned the item. `extendSchema` middleware now guards both cases (`pre('save')` with the loaded status, and `pre('findOneAndDelete')`). A `beforeUpdate` hook stops a generic PATCH from re-pointing a loan to another item or borrower.
- L6 (forged workflow status): 5 tests, passing on the first run.

### Task group 3: checkout workflow (3.1–3.6)
- `checkoutService`: pure `validateDueBack`, plus `request`, `approve`, `reject`, `cancel`, `returnItem` and `mine`. Each write runs in a transaction and logs activity on both the checkout and the equipment.
- L2: pure, 4 properties (up to 500 runs). L1: a `fc.commands` model covering request, approve, concurrent approve‖approve, return, reject, cancel (owner or stranger), sweep (+60 days) and repair. It checks the invariant and the model after every command (30 runs, ≤ 25 commands each), plus an N-way concurrent-approval race and the partial-index guard. L3: 30 runs.
- **Mutation checks of L1:**
  - Removing the `status: 'Available'` condition from approve did *not* fail L1, because the partial unique index still turned the race loser into a 409. This shows the second guard works.
  - Making every return go to Available was caught immediately. Shrunk counterexample: `[request(eq0,u0), approve(#0), return(#0, Damaged)]`.
- A test bug, not a code bug: Mongoose casts `{ 'diff.checkout': [a, b] }` on a Mixed path to `$in`, which double-counted entries. The fix uses `$eq`.

### Task group 4: calibration (4.1, 4.2)
- `beforeCreate` rejects a future `performedAt` (400) and items that are CheckedOut or Retired (409), and defaults `performedBy` to the caller. `afterCreate` applies the pure `calibrationOutcome` and logs the equipment change in the same transaction.
- L4: 1 pure property (300 runs), 1 DB property (40 runs), a future-date rollback property and a 409 test. All passed on the first run. The Core hook ctx uses the real clock, so the DB property generates dates relative to `Date.now()`.

### Task groups 5–7: checkpoint, labels and scan, voice (5, 6.1, 7.x)
- `labelService`: vector QR codes (`qrcode@^1.5.4`) on A4 at 3 × 8 labels per page. `GET /api/equipment/by-tag/:tag` returns the borrower by name only.
- `fuzzyMatch`: uses *unrestricted* Damerau-Levenshtein. The OSA variant measures `ab → bca` as 3 edits although only 2 edits produce it, which would break L5.
- **fast-check counterexample (L5):** `[["aaa"], 0, "aaa"]`. The first draft of the test prefixed queries with "who has the", but "who" and "has" are not stop-words (the intent regex strips them). The test was fixed, and the shrunk case is kept as a regression unit test.
- Intents `WHO_HAS`, `IS_AVAILABLE`, `CALIBRATION_DUE`, `OVERDUE_RETURNS`. Borrower names in OVERDUE_RETURNS go to staff only. App intents run before the built-in `LIST_OVERDUE`.
- `dashboard/outNow.js`: overdue loans first, flagged `overdue`.
- The seed is `seed/lab.seed.js` plus thin `seed/data/*.js` files. `insertMany` bypasses hooks, so the seed computes status, `nextCalibration`, CalibrationDue and Maintenance itself. The integration test asserts the single-loan invariant over the seed.
- **Smoke bug:** `fetch` refused port 5061 ("bad port": SIP-TLS is on the Fetch spec's blocked list). The smoke script now uses `node:http`.

### Task group 8: client (6.2, 6.3, 8.x)
- Pages:
  - `Scan` (BarcodeDetector camera with a bubbling-beaker overlay, which is frozen under reduced motion; manual entry; not-found state)
  - `MyCheckouts`
  - `PrintLabels` (row selection → PDF; the Core `ResourceList` has no selection, so this is a staff page in the sidebar)
  - `CheckoutDetail`, which overrides `r/checkouts/:id` through appRoutes specificity
- Components: `EquipmentCard`, `CheckoutDialog`, `ReturnDialog`, `RejectDialog`, `CheckoutActions` (controls hidden by role), `LabelPrintButton`.
- Rich voice renderers: `WHO_HAS`, `IS_AVAILABLE`, `CALIBRATION_DUE`.
- Report presets: Calibration Audit and Overdue loans. The equipment `report.columns` now match Req 7.2 exactly; the design snippet also listed `condition`.
- Checked by hand at 375 px and desktop on ports 5101/5201: approving from the scan card and the voice rich answer both work.

### Task group 9–10: docs and final checkpoint
- `lab-ledger/README.md` rewritten.
- Final numbers:
  - Server: **119 tests, 24 suites** (core 68 unchanged + app 51)
  - Client: **43 tests, 4 files** (31 skeleton + 12 Lab)
  - `vite build` succeeds
  - Smoke: **40/40 PASS**
  - `check-core`: passes

## Known limitations
- Hook ctx `now` is the wall clock (Core), so calibration tests cannot inject time.
- The generic `/r/equipment` list page cannot select rows; label printing has its own page.
- Screenshots in the README are placeholders.
