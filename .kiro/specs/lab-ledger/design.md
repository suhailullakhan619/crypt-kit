# Design Document

## Overview

Lab Ledger is `/skeleton` copied by `npm run summon -- lab-ledger` and then extended **only through extension points** (skeleton Req 16). No Core file is edited. Most of the app is declared as resources. The checkout workflow, labels and scan lookup are hand-written using the skeleton's route → controller → service → model layering.

| Concern | How it is built | Lines of app code (target) |
|---|---|---|
| Labs, equipment, calibrations | 3 resource files | ~120 |
| Checkouts (listing, meta, sweeper, dashboard) | 1 resource file | ~50 |
| Checkout workflow | `routes/app/checkouts.js` → `checkoutController` → `checkoutService` | ~200 |
| Calibration scheduling | `calibrations.hooks.afterCreate` | ~30 |
| QR labels + scan lookup | `routes/app/equipment.js` → `labelService` (pdfkit + `qrcode`) | ~120 |
| Voice | 4 files in `intents/` | ~150 |
| Dashboard panel | `dashboard/outNow.js` + `client/src/dashboard/outNow.jsx` | ~80 |
| Client pages | `Scan.jsx`, `MyCheckouts.jsx`, `appRoutes.jsx`, theme | ~400 |

Keeping the app code this small is part of the Skeleton Crew pitch.

---

## App-Specific Structure

```
lab-ledger/
├── server/
│   ├── crypt.config.js                 # roles: LabManager, Technician, Student; theme: mad-lab
│   └── src/
│       ├── resources/
│       │   ├── labs.js · equipment.js · calibrations.js · checkouts.js
│       ├── routes/app/
│       │   ├── checkouts.js            # POST /checkouts, /:id/approve, /:id/reject, /:id/cancel, /:id/return
│       │   └── equipment.js            # POST /equipment/labels, GET /equipment/by-tag/:tag
│       ├── controllers/  checkoutController.js · equipmentController.js
│       ├── services/     checkoutService.js · labelService.js
│       ├── intents/      whoHas.js · isAvailable.js · calibrationDue.js · overdueReturns.js
│       ├── utils/        fuzzyMatch.js       # Damerau-Levenshtein ≤ 2 per token
│       ├── dashboard/    outNow.js
│       └── seed/         lab.seed.js
└── client/src/
    ├── appRoutes.jsx                   # /scan, /scan/:tag, /my-checkouts
    ├── pages/        Scan.jsx · MyCheckouts.jsx
    ├── components/lab/ EquipmentCard.jsx · CheckoutDialog.jsx · ReturnDialog.jsx · LabelPrintButton.jsx
    ├── dashboard/    outNow.jsx
    └── theme/        tokens.css (mad-lab)
```

---

## Resource Definitions (abridged)

> **Note:** Refs name resource keys (`ref: 'labs'`, `ref: 'equipment'`) or `'User'`; the model-name style in the snippets below (`ref: 'Lab'`) predates skeleton task 4.1.

```js
// equipment.js
defineResource({
  key: 'equipment', label: 'Equipment', icon: 'microscope', titleField: 'name',
  fields: {
    name:        { type: 'string', required: true, list: true, search: true },
    assetTag:    { type: 'string', required: true, unique: true, list: true, search: true },
    serialNumber:{ type: 'string', search: true },
    category:    { type: 'enum', values: CATEGORIES, list: true, filter: true },
    lab:         { type: 'ref', ref: 'Lab', list: true, filter: true },
    status:      { type: 'enum', values: ['Available','CheckedOut','Maintenance','CalibrationDue','Retired'], default: 'Available', list: true, filter: true },
    condition:   { type: 'enum', values: ['Good','Fair','Damaged'], default: 'Good', filter: true },
    requiresCalibration:     { type: 'boolean', default: false, filter: true },
    calibrationIntervalDays: { type: 'number', min: 1 },
    nextCalibration:         { type: 'date', list: true },
    notes:       { type: 'text' },
  },
  permissions: { read: ['Technician','Student'], create: [], update: ['Technician'], delete: [] }, // LabManager = superuser
  statusFlow: {
    field: 'status',
    workflowOnly: ['CheckedOut'],
    transitions: {
      Available: ['Maintenance','Retired'], Maintenance: ['Available','Retired'],
      CalibrationDue: ['Maintenance','Available'], CheckedOut: [], Retired: [],
    },
  },
  due: { field: 'nextCalibration', status: 'status', from: ['Available'], to: 'CalibrationDue' },
  softDelete: { field: 'status', value: 'Retired', at: 'retiredAt' },
  report: { columns: ['name','assetTag','lab','status','condition','nextCalibration'] },
  voice: { synonyms: ['equipment', 'instruments', 'items', 'devices'] },
});

// checkouts.js
defineResource({
  key: 'checkouts', label: 'Checkouts', icon: 'hand-helping', titleField: 'equipment',
  fields: {
    equipment:  { type: 'ref', ref: 'Equipment', required: true, list: true, filter: true },
    borrower:   { type: 'ref', ref: 'User', required: true, list: true, filter: true },
    status:     { type: 'enum', values: ['Requested','Active','Overdue','Returned','Rejected','Cancelled'], default: 'Requested', list: true, filter: true },
    purpose:    { type: 'string' },
    dueBack:    { type: 'date', required: true, list: true },
    approvedBy: { type: 'ref', ref: 'User' }, checkedOutAt: { type: 'date' },
    receivedBy: { type: 'ref', ref: 'User' }, returnedAt:   { type: 'date' },
    returnCondition: { type: 'enum', values: ['Good','Fair','Damaged'] },
    rejectReason: { type: 'string' },
  },
  permissions: { read: ['Technician','Student'], create: [], update: [], delete: [] },
  due: { field: 'dueBack', status: 'status', from: ['Active'], to: 'Overdue' },
  voice: { synonyms: ['checkouts', 'loans'] },
});
```

`calibrations.js` declares `hooks.afterCreate(doc, ctx)`, which:
- loads the equipment in `ctx.session`
- sets `nextCalibration = addDays(doc.performedAt, interval)` when `requiresCalibration` is true
- applies the status rule from Req 4.2

`hooks.beforeCreate` rejects a future `performedAt` with a 400.

---

## Checkout Service

```
request({ equipmentId, dueBack, purpose }, user, now)
  validateDueBack(dueBack, now)                 → 400 unless now < dueBack ≤ now + 30d   (pure)
  eq = Equipment.findById → 404
  eq.status !== 'Available'                     → 409 "Equipment is <status>"
  create Checkout{Requested}; activity(create)

approve(id, user)          withTransaction:
  co = Checkout.findById(id).session(s) → 404; co.status !== 'Requested' → 409
  eq = Equipment.findOneAndUpdate({ _id: co.equipment, status: 'Available' },
                                  { status: 'CheckedOut' }, { session: s, new: true })
  eq == null                                     → 409 "Equipment is no longer available"
  co.status = 'Active'; approvedBy; checkedOutAt = now; save(s)
  activity(status) on checkout + equipment

return(id, { condition, notes }, user)   withTransaction:
  co.status ∉ {Active, Overdue}                  → 409
  co → Returned, returnedAt, receivedBy, returnCondition
  eq.status = condition === 'Damaged' ? 'Maintenance' : 'Available'; eq.condition = condition

reject(id, reason, user)  Requested → Rejected (reason required → 400)
cancel(id, user)          Requested → Cancelled; user must be borrower (403) unless Technician/LabManager
```

The single-active-checkout invariant (Req 3.4) holds for two reasons:
- the conditional `findOneAndUpdate({ status: 'Available' })` inside the transaction
- a partial unique index `{ equipment: 1 }` with `partialFilterExpression: { status: { $in: ['Active','Overdue'] } }`, declared through `extendSchema` in `checkouts.js`, which acts as a second guard

---

## API Endpoints (app-specific)

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/checkouts` | Student, Technician, LabManager | request |
| POST | `/api/checkouts/:id/approve` | Technician, LabManager | |
| POST | `/api/checkouts/:id/reject` | Technician, LabManager | `{ reason }` |
| POST | `/api/checkouts/:id/cancel` | borrower or Technician/LabManager | |
| POST | `/api/checkouts/:id/return` | Technician, LabManager | `{ condition, notes }` |
| GET | `/api/checkouts/mine` | any | current user's checkouts |
| GET | `/api/equipment/by-tag/:tag` | any | equipment + active checkout (borrower name only) |
| POST | `/api/equipment/labels` | Technician, LabManager | `{ ids }` (≤ 60) → `application/pdf` |

---

## Voice Intents

| Intent | Example | Handler |
|---|---|---|
| `WHO_HAS` | "who has the oscilloscope" | fuzzy-match equipment names. One match → active checkout → "Priya has LL-0042, due back Friday", or "It's on the shelf in Physics B-12". Several matches → "I found 3: LL-0042, LL-0043, LL-0051" |
| `IS_AVAILABLE` | "is the centrifuge available" | same matching, then a yes/no with status |
| `CALIBRATION_DUE` | "what needs calibration this month" | `nextCalibration` ≤ end of month, or status `CalibrationDue` |
| `OVERDUE_RETURNS` | "which items are overdue" | checkouts in `Overdue`, plus borrower names for Technician/LabManager, count only for Students |

`fuzzyMatch(query, candidates)` is a pure function. It tokenizes, drops stop-words ("the", "a"), and accepts a candidate when every query token is within Damerau-Levenshtein distance 2 of some candidate token.

---

## Client

- **`Scan.jsx`:** if `'BarcodeDetector' in window`, it opens `getUserMedia({ video: { facingMode: 'environment' } })` and reads frames until it detects a QR, then routes to `/scan/:tag`. Otherwise it shows a manual input. The "scanning" frame has a subtle green bubbling-beaker overlay, which is disabled under reduced motion.
- **`EquipmentCard`:** shows the status badge, lab, borrower and due back, next calibration, and actions by role: Request (Student, when Available), Approve/Reject (Tech, on pending), Return (Tech, when out).
- **`LabelPrintButton`:** on the equipment list page, select rows → "Print labels" → download the PDF.
- **Theme `mad-lab`:** `--background: 222 30% 9%`, `--primary: 142 72% 45%` (flask green), `--accent: 280 60% 60%` (potion purple). The logo is an inline SVG beaker with bubbles.

---

## Correctness Properties

### Property L1: At Most One Active Checkout per Equipment
For any interleaving of request, approve, return, reject and cancel operations (including concurrent approvals of different requests for the same item), no equipment ever has more than one checkout in `Active` or `Overdue`. Its status is `CheckedOut` if and only if it has exactly one such checkout.
**Validates: Requirements 3.3, 3.4, 3.5**

### Property L2: Due-Back Validation
For any `now` and `dueBack`, `validateDueBack` accepts the value if and only if `now < dueBack ≤ now + 30 days`.
**Validates: Requirements 3.2**

### Property L3: Return Restores the Correct Equipment State
For any active checkout and return condition, after `return` the equipment status is `Maintenance` if the condition is `Damaged` and `Available` otherwise, and the equipment condition equals the returned condition.
**Validates: Requirements 3.5**

### Property L4: Calibration Schedules the Next Due Date
For any equipment with `requiresCalibration` and an interval in [1, 3650], and any past `performedAt`, after creating a calibration `nextCalibration = performedAt + interval days`. A `Fail` result always leaves the equipment in `Maintenance`.
**Validates: Requirements 4.1, 4.2**

### Property L5: Fuzzy Match Tolerates Small Typos
For any equipment name and any perturbation of at most 2 edits per token, `fuzzyMatch` includes the original item in its results. For any query token farther than 2 edits from every candidate token, the result is empty.
**Validates: Requirements 6.2**

### Property L6: Workflow-Only Status Cannot Be Forged
For any equipment and any generic PATCH that sets `status` to `CheckedOut` or moves it out of `CheckedOut`, the response is 409 and the equipment is unchanged.
**Validates: Requirements 2.3, 3.8**

---

## Testing Strategy

The skeleton suites run unchanged, which proves the core is identical. App suites:
- `checkoutService.property.test.js` (L1, L3) uses a memory replica set and fast-check `fc.commands` model-based testing for interleavings.
- `validateDueBack.property.test.js` (L2) and `fuzzyMatch.property.test.js` (L5) are pure.
- `calibrations.property.test.js` (L4) and `equipmentFlow.property.test.js` (L6) are DB-backed.
- Integration: the Student requests, the Tech approves, the sweeper marks Overdue with an injected `now`, the Tech returns the item as Damaged, and the equipment ends in Maintenance.
