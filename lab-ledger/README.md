# 🧪 Lab Ledger

**Who has the oscilloscope?** Lab Ledger tracks the unique, serial-numbered equipment in university teaching labs — oscilloscopes, microscopes, centrifuges, pipettes: who has each item, where it lives, and when it needs calibrating.

Live demo: https://leb-ledger.netlify.app (one-click demo buttons on the login page).

It is the first app raised from the [Crypt Kit skeleton](../skeleton/README.md) and has every [shared feature](../README.md#shared-features-every-app-gets-them-from-the-skeleton): sign-up with approval, password reset by email, notifications with email, CSV import/export, saved views and themed PDFs. The Core (`server/src/core`, `server/src/middleware`, `server/test/core`, `server/jest.config.js`, `client/src/components/resource`, `client/src/lib/can.js`) is byte-identical to `/skeleton` — run `node scripts/check-core.js` from the repo root. Everything Lab-specific is added through the skeleton's extension points.

## The problem

Teaching labs still run on paper sign-out sheets and spreadsheets. Equipment goes missing, students can't find what is free, and calibrations lapse right before an inspection.

## Who uses it

| Role | Who | Can do |
|---|---|---|
| **LabManager** (superuser) | runs the labs and the inventory | everything: labs, equipment, users, generic edits, reports |
| **Technician** | looks after the benches | approve / reject requests, record returns, log calibrations, edit equipment, print QR labels |
| **Student** | borrows equipment | browse, scan labels, request a checkout, cancel their own requests, see their loans |

### Demo accounts (DEMO_MODE)

The login page shows one-click buttons for these accounts.

| Role | Email | Password |
|---|---|---|
| LabManager | manager@lab.test | lab-manager-demo |
| Technician | tech@lab.test | lab-tech-demo |
| Student | student@lab.test | lab-student-demo |

## Resources

| Resource | Key fields | Rules |
|---|---|---|
| **Labs** (`labs`) | name (unique), building, room, manager | everyone reads; LabManager writes |
| **Equipment** (`equipment`) | name, assetTag (unique, stored upper-case), serialNumber, category, lab, status, condition, requiresCalibration, calibrationIntervalDays, nextCalibration, notes | status flow with **`CheckedOut` workflow-only**; due rule `nextCalibration` → `CalibrationDue`; DELETE retires the item; Technicians may edit |
| **Calibrations** (`calibrations`) | equipment, performedAt, performedBy, result (Pass/Adjusted/Fail), certificateNo, notes | Technician/LabManager create; hooks reject future dates and schedule `nextCalibration = performedAt + interval`; Fail → Maintenance, a pass clears CalibrationDue |
| **Checkouts** (`checkouts`) | equipment, borrower, status, purpose, dueBack, approvedBy, checkedOutAt, receivedBy, returnedAt, returnCondition, rejectReason | every status is workflow-only; generic writes LabManager-only; due rule `dueBack` → `Overdue`; partial unique index = at most one Active/Overdue loan per item |

**Reservations** (`reservations`): book an item for a time window ahead of time. Students and Technicians book for themselves; windows for the same item may not overlap (HTTP 409, also under concurrent requests); a booking lasts at most 14 days and opens at most 90 days ahead; only the owner or staff can cancel, nothing else can be edited. Finished bookings become `Completed` automatically, without notifications.

**Insights** (`/insights`, Technician and LabManager): the most and least used equipment (loans and days out, including items never borrowed) over 30, 90 or 365 days, and a list of borrowers with late or overdue loans. *Download PDF* stores the report with the others. API: `GET /api/insights`, `POST /api/insights/report`.

## Workflows

```
Student: scan label ─▶ Request (dueBack ≤ 30 days) ─▶ Requested ─┬─▶ Cancel (own request) ─▶ Cancelled
Technician:                                                     ├─▶ Reject (reason) ───────▶ Rejected
                                                                └─▶ Approve ─▶ Active ──(sweeper, past dueBack)──▶ Overdue
                                                                               └──────────┬──────────────────────┘
Technician: Record return (Good / Fair / Damaged) ─────────────────────────────────────▶ Returned
            equipment → Available, or Maintenance when Damaged
```

- **Approve** runs in one transaction with a conditional `findOneAndUpdate({ status: 'Available' })` on the equipment, so two concurrent approvals for the same item can never both win (HTTP 409 for the loser). A partial unique index is the second guard.
- Every transition writes an Activity Log entry on **both** the checkout and the equipment.
- **Calibration**: logging one schedules the next due date; the skeleton sweeper flags items whose date has passed as `CalibrationDue`.
- **QR labels**: every equipment detail page has a QR card (download PNG, print one label, copy link). On the Equipment list, staff tick rows → *Print labels* bulk action → A4 PDF in the portal's colours, 3 × 8 labels per sheet. Each QR opens `<CLIENT_URL>/scan/<assetTag>`; a signed-out visitor signs in first and then lands on the item.
- **Scan**: `/scan` reads a label with the camera (`BarcodeDetector`, or `jsQR` in browsers without it), from a photo or screenshot, or from a typed asset tag or pasted label link. `/scan/LL-0042` shows the item card with status, borrower, due back, next calibration and the actions you are allowed to take. Unknown tags: “No equipment haunts this tag”.
- **Voice** (text or speech): “who has the oscilloscope?”, “is the centrifuge available?”, “what needs calibration this month?”, “which items are overdue?” — names are fuzzy-matched (≤ 2 typos per word).
- **Dashboard**: an *Out right now* panel lists active loans with overdue ones first and highlighted.
- **Reports**: one-click *Calibration Audit* preset (equipment with `requiresCalibration`, columns name, asset tag, lab, status, next calibration, overdue by) and *Overdue loans*.

## API (app-specific)

| Method | Path | Roles |
|---|---|---|
| POST | `/api/checkouts` `{ equipmentId, dueBack, purpose }` | everyone |
| POST | `/api/checkouts/:id/approve` | Technician, LabManager |
| POST | `/api/checkouts/:id/reject` `{ reason }` | Technician, LabManager |
| POST | `/api/checkouts/:id/cancel` | the borrower (or staff) |
| POST | `/api/checkouts/:id/return` `{ condition, notes }` | Technician, LabManager |
| GET | `/api/checkouts/mine` | everyone |
| GET | `/api/equipment/by-tag/:tag` | everyone |
| POST | `/api/equipment/labels` `{ ids }` (≤ 60) → PDF | Technician, LabManager |

Plus everything the skeleton provides: `/api/r/:key` CRUD, `/api/meta`, `/api/dashboard`, `/api/reports`, `/api/voice/*`.

## Run it (no database needed)

```bash
npm install --prefix server && npm install --prefix client
cp server/.env.example server/.env        # DEMO_MODE=true by default
npm run dev --prefix server               # API on http://localhost:5000
npm run dev --prefix client               # app on http://localhost:5173
```

Demo mode starts an in-memory MongoDB replica set (transactions work) and seeds 3 labs, 40 equipment items, 25 calibrations, 12 checkouts in every status (two of them overdue) and 4 reservations. Set `CLIENT_URL` to the public client URL before printing labels so the QR codes point at your deployment.

### 60-second demo path

1. Sign in as **Student** → *Scan a label* → type `LL-0005` → *Request checkout*.
2. Sign in as **Technician** → open `/scan/LL-0005` → *Approve*.
3. *Voice agent* → “who has the oscilloscope?” → “Priya Student has the Digital Oscilloscope (LL-0001), due back …”.
4. *Reports* → **Calibration Audit** → the PDF downloads.

## Tests

```bash
npm test --prefix server     # Jest, 346 tests: skeleton suites ("core" project) + Lab Ledger suites ("app" project)
npm test --prefix client     # Vitest, 180 tests: skeleton UI tests + Lab Ledger pages, dialogs, scan, contrast
npm run smoke --prefix server   # boots demo mode and runs 40 HTTP checks (SMOKE_PORT to change the port)
```

The server runs two Jest projects. **core** runs the skeleton's suites unchanged against the skeleton's reference config (`test/core/crypt.config.js`, with app routes stubbed out exactly as in `/skeleton`). **app** runs Lab Ledger's suites, including the correctness properties from the design:

| Property | Suite |
|---|---|
| L1 At most one active checkout per item (fast-check `fc.commands` model + concurrent approvals) | `src/services/checkoutService.property.test.js` |
| L2 Due-back validation | `src/services/validateDueBack.property.test.js` |
| L3 Return restores the correct equipment state | `src/services/checkoutService.property.test.js` |
| L4 Calibration schedules the next due date | `src/resources/calibrations.property.test.js` |
| L5 Fuzzy match tolerates small typos | `src/utils/fuzzyMatch.property.test.js` |
| L6 Workflow-only status cannot be forged | `src/resources/equipmentFlow.property.test.js` |

## Screenshots

_Captured from a real browser run (Chrome, demo data), in [`docs/screenshots/`](../docs/screenshots)._

- `lab-dashboard.png` — dashboard with the *Out right now* panel
- `lab-scan-mobile.png` — scan result card at 375 px
- `lab-voice.png` — “who has the oscilloscope?”
- `lab-reservations.png`, `lab-reservation-form.png` — bookings list and the date-time booking form
- `lab-insights.png` — most and least used equipment, late borrowers
- `lab-import.png` — CSV import check before anything is written
- `lab-saved-views.png` — saved filter chips on a list
- `lab-email-snackbar.png` — notifications panel with *Email me a test*
