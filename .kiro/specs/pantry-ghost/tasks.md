# Implementation Plan: Pantry Ghost

## Overview

Raise Pantry Ghost from the finished skeleton. Build the pure domain functions in `src/domain/` first, and lock them down with property tests before any database code uses them. Then add resources, the expiry job, intake, FEFO distribution, voice, the impact report and the client.

**Prerequisite:** the skeleton spec is complete through task 16. Lab Ledger is not required, so the two app specs can run in parallel.

## Tasks

- [x] 1. Summon and configure
  - [x] 1.1 Run `npm run summon -- pantry-ghost`; set `crypt.config.js` (roles Coordinator/Volunteer/Board, theme `lantern`, 3 demo users)
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Create the `lantern` theme tokens and the ghost-with-lantern mascot SVG for empty states
    - _Requirements: 1.3_

  - [x] 1.3 Run the skeleton test suites inside `/pantry-ghost/server` unchanged and confirm they pass
    - _Requirements: 1.4_

- [x] 2. Build the pure domain functions
  - [x] 2.1 Implement `domain/expiryWindows.js` and `domain/classifyExpiry.js`
    - _Requirements: 3.1_

  - [x]* 2.2 Write property test for expiry classification (Property P4)
    - **Property P4: Expiry Classification Is Total and Monotonic**
    - **Validates: Requirements 3.1**

  - [x] 2.3 Implement `domain/numberWords.js`, `domain/dateWords.js`, `domain/categoryKeywords.js` and `domain/parseIntake.js`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x]* 2.4 Write the sentence-template generator and the property test for the intake round trip (Property P5)
    - **Property P5: Intake Parser Round Trip**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x] 2.5 Implement `domain/planFefo.js`
    - _Requirements: 5.1, 5.2_

  - [x]* 2.6 Write property test for the FEFO plan (Property P3)
    - **Property P3: FEFO Plan Is Valid and Earliest-First**
    - **Validates: Requirements 5.1, 5.2**

- [x] 3. Declare resources
  - [x] 3.1 Create `resources/donors.js` and `resources/stock-lots.js` (`beforeCreate` classifies status; workflow-only statuses; soft delete to Discarded)
    - _Requirements: 2.1, 2.2_

  - [x] 3.2 Create `resources/households.js` (auto code in `beforeCreate`, `dietary` multi-enum, Board excluded) and `resources/distributions.js` (`lines` via `extendSchema`; generic mutations denied)
    - _Requirements: 2.3, 2.4, 2.5_

  - [x]* 3.3 Write property test for household privacy (Property P6)
    - **Property P6: Households Never Hold PII and Board Never Sees Them**
    - **Validates: Requirements 2.3, 2.4, 6.2, 7.3**

- [x] 4. Implement the expiry job and dashboard panels
  - [x] 4.1 Implement `jobs/app/classifyExpiry.job.js` (boot + hourly; activity entries for changes)
    - _Requirements: 3.2_

  - [x] 4.2 Implement the `dashboard/useFirst.js` and `dashboard/thisMonth.js` panels with matching client components
    - _Requirements: 3.3_

- [x] 5. Implement intake
  - [x] 5.1 Implement `intakeService` (`parse` loads donors and calls `parseIntake`; `save` bulk-creates through the resource service so hooks and activity run), its controller and `routes/app/intake.js`
    - _Requirements: 4.5_

  - [x] 5.2 Implement `Intake.jsx` with `DraftRow` (mic + text, editable drafts, missing-field highlighting, Save all)
    - _Requirements: 4.6_

- [x] 6. Implement FEFO distribution
  - [x] 6.1 Implement `distributionService.plan` and `distributionService.commit` (transaction, conditional `$inc`, Depleted marking, 409 with `short`), its controller and routes
    - _Requirements: 5.3, 5.4, 5.5_

  - [x]* 6.2 Write concurrent property test for non-negative stock (Property P1)
    - **Property P1: Stock Never Goes Negative**
    - **Validates: Requirements 5.4, 5.5**

  - [x]* 6.3 Write property test for failed-distribution rollback (Property P2)
    - **Property P2: Failed Distributions Change Nothing**
    - **Validates: Requirements 5.4**

  - [x] 6.4 Implement `Distribute.jsx` with `HouseholdPicker`, `ItemChips` (dietary warnings) and `PickList` (grouped by location)
    - _Requirements: 5.6_

- [x] 7. Checkpoint: pantry core loop
  - Ensure all tests pass; walk through voice intake → save → plan → commit → stock decremented; ask the user if questions arise.

- [x] 8. Implement the voice intents
  - [x] 8.1 Implement the intents `intake` (draft only, never saves), `expiringThisWeek`, `stockOf` and `householdsServed` (`aggregateOnly`)
    - _Requirements: 6.1, 6.2_

  - [x] 8.2 Show the intake draft confirm card on the Voice Agent page when `intent === 'INTAKE'` (via the app's voice result renderer)
    - _Requirements: 4.5, 6.1_

- [x] 9. Implement the impact report
  - [x] 9.1 Implement `impactService` aggregations and `render` using the skeleton `createReport` helpers (including the weekly bar chart); add `routes/app/impact.js`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 9.2 Add an "Impact report" month picker to the Reports page for Coordinator and Board
    - _Requirements: 7.1_

- [x] 10. Implement seed data and docs
  - [x] 10.1 Implement `seed/pantry.seed.js` (12 donors, 120 lots over 60 days, 45 households, 150 distributions)
    - _Requirements: 7.4_

  - [x] 10.2 Write `pantry-ghost/README.md` (problem, users, privacy stance, demo credentials, resources table)
    - _Requirements: 1.1_

- [x] 11. Final checkpoint: Pantry Ghost
  - Ensure all tests pass; record the 60-second demo path (speak an intake → save → "what expires this week?" → distribute FEFO → impact PDF); ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional for an MVP, but the property tests are part of the hackathon story. Keep them.
- If a needed capability is missing from Core, add it to the skeleton spec first. Never patch Core in this folder.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.3", "2.5"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["3.3", "4.2", "5.1", "6.1"] },
    { "id": 5, "tasks": ["5.2", "6.2", "6.3", "6.4", "8.1", "9.1"] },
    { "id": 6, "tasks": ["8.2", "9.2", "10.1"] },
    { "id": 7, "tasks": ["10.2"] }
  ]
}
```
