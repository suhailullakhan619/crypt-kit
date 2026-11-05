# Requirements Document

## Introduction

Lab Ledger is the first app raised from the Crypt Kit skeleton. It lives in `/lab-ledger`. It helps university teaching labs track **unique, serial-numbered equipment** (oscilloscopes, microscopes, centrifuges, pipettes): who has each item, where it is, and when it needs calibration.

Today many labs use paper sign-out sheets and spreadsheets. As a result, equipment goes missing, students can't find what they need, and calibrations lapse before inspections.

Lab Ledger inherits everything in the skeleton spec (`.kiro/specs/crypt-kit-skeleton`) and adds:
- a request → approve → checkout → return workflow
- calibration logging that schedules the next due date
- printable QR labels with a scan page
- lab-specific voice questions such as "who has the oscilloscope?"

## Glossary

- **Lab**: A physical room where equipment is kept (e.g. "Physics B-12").
- **Equipment**: A unique, physically labelled item with an asset tag. It is a skeleton Resource with key `equipment`.
- **Asset Tag**: A unique human-readable identifier printed on the QR label (e.g. `LL-0042`).
- **Checkout**: A loan of one Equipment item to one borrower, with a due-back date.
- **Checkout Status**: `Requested`, `Active`, `Overdue`, `Returned`, `Rejected` or `Cancelled`.
- **Calibration**: A recorded calibration event with a result (`Pass`, `Adjusted`, `Fail`) and the next due date.
- **Lab Manager**: The Superuser Role.
- **Technician**: A role that approves checkouts, records returns and logs calibrations.
- **Student**: A role that can browse equipment, request checkouts and cancel their own requests.

---

## Requirements

### Requirement 1: App Foundation

**User Story:** As a developer, I want Lab Ledger raised from the skeleton with an unchanged core, so that it proves the skeleton's reuse.

#### Acceptance Criteria

1. THE `/lab-ledger` folder SHALL be created with `npm run summon -- lab-ledger`. Its `core/`, shared `middleware/`, `client/src/components/resource/` and `client/src/lib/can.js` SHALL be byte-identical to `/skeleton`.
2. THE `crypt.config.js` SHALL set `appName: 'Lab Ledger'`, `roles: ['LabManager', 'Technician', 'Student']` and `theme: 'mad-lab'`.
3. THE Client SHALL use a "Mad Lab" theme: dark slate background, bubbling-flask green accent and a beaker logo. It SHALL meet WCAG AA contrast.
4. ALL skeleton requirements SHALL continue to hold in Lab Ledger.

---

### Requirement 2: Lab, Equipment and Calibration Resources

**User Story:** As a lab manager, I want to record labs, equipment and calibrations, so that I have one accurate inventory.

#### Acceptance Criteria

1. THE `labs` Resource SHALL have fields `name` (required, unique), `building`, `room`, and `manager` (ref User). Everyone may read it. Only LabManager may create, update or delete.
2. THE `equipment` Resource SHALL have these fields:
   - `name` (required, search)
   - `assetTag` (required, unique, search)
   - `serialNumber`
   - `category` (enum: Measurement, Imaging, Biology, Chemistry, Electronics, Safety, Other)
   - `lab` (ref Lab, filter)
   - `status` (enum: Available, CheckedOut, Maintenance, CalibrationDue, Retired)
   - `condition` (enum: Good, Fair, Damaged)
   - `requiresCalibration` (boolean)
   - `calibrationIntervalDays` (number, min 1)
   - `nextCalibration` (date)
   - `notes` (text)
3. THE `equipment` Resource SHALL declare a Status Flow in which `CheckedOut` can only be entered or left through the checkout workflow, not through generic PATCH.
4. THE `equipment` Resource SHALL declare a Due Rule on `nextCalibration` from `[Available]` to `CalibrationDue`, and soft delete to `Retired`.
5. THE `calibrations` Resource SHALL have fields `equipment` (ref, required), `performedAt` (date, required), `performedBy` (ref User), `result` (enum: Pass, Adjusted, Fail), `certificateNo` and `notes`. LabManager and Technician may create it, and everyone may read it.

---

### Requirement 3: Checkout Workflow

**User Story:** As a student, I want to request equipment and see when it's due back, and as a technician I want to approve and record returns, so that we always know who has what.

#### Acceptance Criteria

1. WHEN a Student posts `{ equipmentId, dueBack, purpose }` to `POST /api/checkouts`, THE Checkout Service SHALL create a Checkout with status `Requested`, borrower = current user, if the equipment is `Available`. Otherwise it SHALL return HTTP 409 naming the current status.
2. IF `dueBack` is not in the future or is more than 30 days ahead, THEN THE Checkout Service SHALL return HTTP 400.
3. WHEN a Technician or LabManager approves a request (`POST /api/checkouts/:id/approve`), THE Checkout Service SHALL, in one transaction, set the Checkout to `Active` with `approvedBy` and `checkedOutAt`, and set the Equipment status to `CheckedOut`.
4. AT any time, an Equipment item SHALL have at most one Checkout in status `Active` or `Overdue`. A second approval for the same item SHALL return HTTP 409 and change nothing.
5. WHEN a Technician or LabManager records a return (`POST /api/checkouts/:id/return` with `{ condition, notes }`), THE Checkout Service SHALL, in one transaction, set the Checkout to `Returned` with `returnedAt` and `receivedBy`. It SHALL set Equipment `condition`, and set Equipment `status` to `Maintenance` if condition is `Damaged`, otherwise to `Available`.
6. WHEN a Technician or LabManager rejects a request, THE Checkout Service SHALL set it to `Rejected` with a required `reason`. WHEN the borrowing Student cancels their own `Requested` checkout, it SHALL become `Cancelled`. A Student SHALL NOT cancel another user's request (HTTP 403).
7. THE `checkouts` Resource SHALL be readable by all roles and SHALL declare a Due Rule on `dueBack` from `[Active]` to `Overdue`, so the skeleton sweeper flags late items.
8. Generic `POST`, `PATCH` and `DELETE` on `/api/r/checkouts` SHALL be denied to all roles except LabManager. All state changes go through the workflow endpoints.
9. EVERY workflow transition SHALL produce an Activity Log entry on both the Checkout and the Equipment.

---

### Requirement 4: Calibration Scheduling

**User Story:** As a technician, I want logging a calibration to schedule the next one, so that the lab passes inspections.

#### Acceptance Criteria

1. WHEN a calibration is created for equipment with `requiresCalibration: true`, THE Calibration Hook SHALL set the equipment's `nextCalibration` to `performedAt + calibrationIntervalDays` days.
2. WHEN the calibration result is `Fail`, THE Calibration Hook SHALL set the equipment status to `Maintenance`. WHEN the result is `Pass` or `Adjusted` and the status was `CalibrationDue`, it SHALL set the status to `Available`.
3. IF a calibration's `performedAt` is in the future, THEN the API SHALL return HTTP 400.

---

### Requirement 5: QR Labels and Scan Page

**User Story:** As a student at the bench, I want to scan a label to see an item and request it, so that I don't have to search.

#### Acceptance Criteria

1. THE API Server SHALL expose `POST /api/equipment/labels` with `{ ids }` (max 60). It SHALL return a PDF of A4 label sheets (3×8 grid), each label showing the QR code (encoding `<CLIENT_URL>/scan/<assetTag>`), name, asset tag and lab.
2. THE Client SHALL provide a `/scan` page that uses the `BarcodeDetector` API with the camera when available, and otherwise a manual asset-tag input.
3. WHEN `/scan/:assetTag` is opened, THE Client SHALL show the equipment card with status, current borrower (if checked out), due-back date, next calibration date and a "Request checkout" button for Students when the item is `Available`.
4. IF no equipment matches the asset tag, THEN THE Client SHALL show "No equipment haunts this tag" with a link to search.

---

### Requirement 6: Lab Voice Intents

**User Story:** As a technician with gloves on, I want to ask lab questions by voice, so that I don't have to touch a keyboard.

#### Acceptance Criteria

1. THE App SHALL register these intents in `server/src/intents/`:
   - `WHO_HAS` ("who has the <equipment name>"): the borrower and due-back date of the active checkout, or "it's on the shelf in <lab>"
   - `IS_AVAILABLE` ("is the <name> available")
   - `CALIBRATION_DUE` ("what needs calibration this month")
   - `OVERDUE_RETURNS` ("which items are overdue")
2. Equipment name matching SHALL be case-insensitive and tolerate an edit distance of up to 2 per word. WHEN several items match, the answer SHALL list up to 3 by asset tag.

---

### Requirement 7: Lab Dashboard and Reports

**User Story:** As a lab manager, I want an inspection-ready report and a dashboard of what's out and what's due, so that I can prepare for audits.

#### Acceptance Criteria

1. THE Dashboard SHALL add a "Out right now" panel listing active checkouts (borrower, item, due back), with overdue ones highlighted.
2. THE App SHALL provide a "Calibration Audit" report preset (resource `equipment`, filter `requiresCalibration=true`, columns name, assetTag, lab, status, nextCalibration). It is generated with the skeleton report service.
3. THE demo seed SHALL create 3 labs, 40 equipment items across categories, 25 calibrations, and checkouts in every status, including 2 overdue.
