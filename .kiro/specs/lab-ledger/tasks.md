# Implementation Plan: Lab Ledger

## Overview

Raise Lab Ledger from the finished skeleton. Every task adds app files only. If a task seems to need a Core edit, stop and add the capability to the skeleton spec first. Order of work: config and resources, then the checkout workflow, then calibration, then labels and scan, then voice, then client polish.

**Prerequisite:** the skeleton spec is complete through task 16 (`npm run summon` works).

## Tasks

- [x] 1. Summon and configure
  - [x] 1.1 Run `npm run summon -- lab-ledger`; set `crypt.config.js` (roles LabManager/Technician/Student, theme `mad-lab`, 3 demo users)
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Create the `mad-lab` theme tokens, the beaker logo SVG and the app name in the Topbar
    - _Requirements: 1.3_

  - [x] 1.3 Run the skeleton test suites inside `/lab-ledger/server` unchanged and confirm they pass
    - _Requirements: 1.4_

- [x] 2. Declare resources
  - [x] 2.1 Create `resources/labs.js`, `resources/equipment.js` (status flow with `workflowOnly: ['CheckedOut']`, due rule, soft delete) and `resources/calibrations.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Create `resources/checkouts.js` (due rule on `dueBack`; generic mutations restricted to LabManager; partial unique index via `extendSchema`)
    - _Requirements: 3.7, 3.8_

  - [x]* 2.3 Write property test for forged workflow status (Property L6)
    - **Property L6: Workflow-Only Status Cannot Be Forged**
    - **Validates: Requirements 2.3, 3.8**

- [x] 3. Implement the checkout workflow
  - [x] 3.1 Implement the pure `validateDueBack(dueBack, now)` in `services/checkoutService.js`
    - _Requirements: 3.2_

  - [x]* 3.2 Write property test for due-back validation (Property L2)
    - **Property L2: Due-Back Validation**
    - **Validates: Requirements 3.2**

  - [x] 3.3 Implement `checkoutService` `request`, `approve`, `reject`, `cancel`, `return` and `mine` (transactions; conditional equipment update; activity on both records)
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.9_

  - [x] 3.4 Implement `checkoutController` and `routes/app/checkouts.js`
    - _Requirements: 3.1, 3.3, 3.5, 3.6_

  - [x]* 3.5 Write model-based property test for the single active checkout (Property L1), using `fc.commands`
    - **Property L1: At Most One Active Checkout per Equipment**
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x]* 3.6 Write property test for return state (Property L3)
    - **Property L3: Return Restores the Correct Equipment State**
    - **Validates: Requirements 3.5**

- [x] 4. Implement calibration scheduling
  - [x] 4.1 Add `hooks.beforeCreate` (reject a future `performedAt`) and `hooks.afterCreate` (next due date + status rule) to `calibrations.js`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x]* 4.2 Write property test for calibration scheduling (Property L4)
    - **Property L4: Calibration Schedules the Next Due Date**
    - **Validates: Requirements 4.1, 4.2**

- [x] 5. Checkpoint: lab backend
  - Ensure all tests pass; walk through request → approve → overdue (sweeper with injected `now`) → return with curl; ask the user if questions arise.

- [x] 6. Implement labels and scan lookup
  - [x] 6.1 Implement `labelService` (pdfkit + `qrcode`, 3×8 A4 grid) and `GET /api/equipment/by-tag/:tag`
    - _Requirements: 5.1, 5.3_

  - [x] 6.2 Implement `Scan.jsx` (BarcodeDetector + camera, manual fallback), `EquipmentCard` and the not-found state
    - _Requirements: 5.2, 5.3, 5.4_

  - [x] 6.3 Implement `LabelPrintButton` on the equipment list (row selection → PDF download)
    - _Requirements: 5.1_

- [x] 7. Implement the voice intents
  - [x] 7.1 Implement the pure `utils/fuzzyMatch.js` (Damerau-Levenshtein ≤ 2 per token, stop-words)
    - _Requirements: 6.2_

  - [x]* 7.2 Write property test for fuzzy matching (Property L5)
    - **Property L5: Fuzzy Match Tolerates Small Typos**
    - **Validates: Requirements 6.2**

  - [x] 7.3 Implement the intents `whoHas`, `isAvailable`, `calibrationDue` and `overdueReturns`
    - _Requirements: 6.1_

- [x] 8. Implement the client workflow and dashboard
  - [x] 8.1 Implement `CheckoutDialog`, `ReturnDialog` and `MyCheckouts.jsx`; wire Approve/Reject/Return actions on the checkout detail page by role
    - _Requirements: 3.1, 3.3, 3.5, 3.6_

  - [x] 8.2 Implement the `dashboard/outNow.js` panel and `client/src/dashboard/outNow.jsx` (overdue highlighted)
    - _Requirements: 7.1_

  - [x] 8.3 Add the "Calibration Audit" preset to the Reports page via `appRoutes.jsx` report presets
    - _Requirements: 7.2_

- [x] 9. Implement seed data and docs
  - [x] 9.1 Implement `seed/lab.seed.js` (3 labs, 40 items, 25 calibrations, checkouts in every status including 2 overdue)
    - _Requirements: 7.3_

  - [x] 9.2 Write `lab-ledger/README.md` (problem, users, demo credentials, resources table, screenshots)
    - _Requirements: 1.1_

- [x] 10. Final checkpoint: Lab Ledger
  - Ensure all tests pass; record the 60-second demo path (scan label → request → approve → "who has the oscilloscope?" by voice → calibration audit PDF); ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional for an MVP, but the property tests are part of the hackathon story. Keep them.
- Never edit `core/`, `middleware/`, `components/resource/` or `lib/can.js` here. The `sync-core` hook owns those.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.1", "7.1"] },
    { "id": 3, "tasks": ["3.3", "4.2", "6.1", "7.2"] },
    { "id": 4, "tasks": ["3.4", "3.6", "7.3"] },
    { "id": 5, "tasks": ["3.5", "6.2", "6.3", "8.1", "8.2", "8.3"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["9.2"] }
  ]
}
```
