# Requirements Document

## Introduction

Pantry Ghost is the second app raised from the Crypt Kit skeleton. It lives in `/pantry-ghost`. It helps **community food banks** manage **quantity-based, perishable stock**. Food expires on shelves because no one can see what to use first, intake is slow when volunteers have their hands full of boxes, and grant reports are assembled by hand.

Pantry Ghost is deliberately a different shape from Lab Ledger. Lab Ledger tracks unique items with a lifecycle. Pantry Ghost tracks **lots** with quantities that are split across many distributions, plus expiry classification, first-expiry-first-out (FEFO) picking, hands-free **voice intake** (voice that *writes* data, not just reads it), and privacy-preserving household records.

It inherits everything in the skeleton spec (`.kiro/specs/crypt-kit-skeleton`).

## Glossary

- **Donor**: An individual or organisation that gives food.
- **Stock Lot**: A quantity of one item received together, sharing an expiry date (e.g. "24 cans black beans, expires 2027-03-01").
- **Unit**: The counting unit for a lot: `item`, `can`, `box`, `kg`, `lb` or `L`.
- **Expiry Status**: The lot status derived from `expiresOn`: `Fresh`, `ExpiringSoon` or `Expired`. Also `Depleted` when the quantity reaches 0, and `Discarded` when a volunteer removes it.
- **Expiring Soon Window**: The number of days before expiry at which a lot becomes `ExpiringSoon`, configured per category (Produce 2, Dairy 3, Bakery 2, Frozen 14, Canned 30, Dry 30, Hygiene 0).
- **Household**: A recipient identified only by a generated code (e.g. `H-0042`). It has a size and dietary flags, and stores no name or address.
- **Distribution**: A record of quantities given to one Household, with one or more lines referencing Stock Lots.
- **FEFO**: First-expiry-first-out. When picking, use the non-expired lot that expires soonest.
- **Intake Draft**: A structured lot proposal parsed from a spoken or typed sentence. A user must confirm it before it is saved.
- **Coordinator**: The Superuser Role.
- **Volunteer**: A role that does intake and distributions.
- **Board**: A read-only role that sees aggregates and reports, but never household records.

---

## Requirements

### Requirement 1: App Foundation

**User Story:** As a developer, I want Pantry Ghost raised from the skeleton with an unchanged core, so that it proves the skeleton handles a very different domain.

#### Acceptance Criteria

1. THE `/pantry-ghost` folder SHALL be created with `npm run summon -- pantry-ghost`. Its core files SHALL be byte-identical to `/skeleton`.
2. THE `crypt.config.js` SHALL set `appName: 'Pantry Ghost'`, `roles: ['Coordinator', 'Volunteer', 'Board']` and `theme: 'lantern'`.
3. THE Client SHALL use a "Lantern" theme: warm charcoal, pumpkin-orange accent, candle glow, and a friendly ghost mascot. It SHALL meet WCAG AA contrast.
4. ALL skeleton requirements SHALL continue to hold in Pantry Ghost.

---

### Requirement 2: Resources

**User Story:** As a coordinator, I want donors, stock and households recorded, so that I know what we have and who we serve.

#### Acceptance Criteria

1. THE `donors` Resource SHALL have fields `name` (required, search), `type` (enum: Individual, Grocery, Farm, Business, FoodDrive), `contact` and `notes`. Coordinator and Volunteer may read and create it. Coordinator alone may update or delete it.
2. THE `stock-lots` Resource SHALL have these fields:
   - `itemName` (required, search)
   - `category` (enum: Produce, Dairy, Bakery, Frozen, Canned, Dry, Hygiene)
   - `quantity` (number, min 0)
   - `unit` (enum)
   - `expiresOn` (date)
   - `donor` (ref)
   - `location` (enum: Shelf, Fridge, Freezer)
   - `status` (enum: Fresh, ExpiringSoon, Expired, Depleted, Discarded)
   - `receivedAt` (date)

   All roles may read it, Coordinator and Volunteer may create and update it, and Coordinator may delete it (soft delete to `Discarded`).
3. THE `households` Resource SHALL have fields `code` (auto-generated, unique, `H-` plus 4 digits), `size` (number, 1–20) and `dietary` (multi-select stored as an array of enum values: Vegetarian, Halal, Kosher, GlutenFree, NutAllergy, Diabetic). It SHALL be readable by Coordinator and Volunteer only, and never by Board.
4. THE `households` Resource SHALL NOT contain any field for name, address, phone or email. A test SHALL assert this.
5. THE `distributions` Resource SHALL be readable by Coordinator and Volunteer. Generic create, update and delete SHALL be denied. Changes happen only through the distribution workflow.

---

### Requirement 3: Expiry Classification

**User Story:** As a volunteer, I want lots flagged before they expire, so that we hand them out instead of throwing them away.

#### Acceptance Criteria

1. THE App SHALL implement a pure function `classifyExpiry(lot, now, windows)`. It SHALL return `Depleted` if quantity is 0, `Discarded` if the lot is discarded, `Expired` if `expiresOn < startOfDay(now)`, `ExpiringSoon` if `expiresOn` is within the category's window, and `Fresh` otherwise. A lot without `expiresOn` (e.g. Hygiene) SHALL be `Fresh`.
2. THE App SHALL register a job that runs at boot and hourly. It SHALL apply `classifyExpiry` to all lots not in `Depleted` or `Discarded` and record a `status` Activity entry for each change.
3. THE Dashboard SHALL show a "Use First" board listing `ExpiringSoon` lots sorted by `expiresOn` ascending, with quantity and location.

---

### Requirement 4: Intake (Typed and Voice)

**User Story:** As a volunteer with my hands full, I want to say "twelve cans of black beans expiring March third from Fresh Mart" and have it logged, so that intake is fast.

#### Acceptance Criteria

1. THE App SHALL implement a pure function `parseIntake(text, { donors, now })` that returns an Intake Draft `{ quantity, unit, itemName, category, expiresOn, donorId, confidence, missing[] }`.
2. `parseIntake` SHALL understand numerals and number words up to "one hundred". It SHALL understand units and their plurals; dates as "March 3rd", "3 March", "2027-03-03", "next Friday" and "in 2 weeks"; and donor names matched case-insensitively with edit distance ≤ 2.
3. WHEN a year is not spoken, `parseIntake` SHALL choose the next future occurrence of that date relative to `now`.
4. `parseIntake` SHALL infer `category` from a keyword table (e.g. beans/soup → Canned, milk/yogurt → Dairy, apples → Produce). If no keyword matches, it SHALL add `category` to `missing`.
5. THE API Server SHALL expose `POST /api/intake/parse` (`{ text }` → draft) and `POST /api/intake` (`{ lots: [...] }` → created lots, HTTP 201). Saving SHALL always be an explicit second call. The voice agent SHALL never create stock without confirmation.
6. THE Client SHALL provide an `/intake` page with a microphone button and a text box. Each utterance appends an editable draft row with missing fields highlighted, and "Save all" commits them.

---

### Requirement 5: FEFO Distribution

**User Story:** As a volunteer packing a box, I want the system to tell me which lots to pull, so that the oldest food goes out first and stock counts stay accurate.

#### Acceptance Criteria

1. THE App SHALL implement a pure function `planFefo(request, lots)`. Here `request` is `[{ category | itemName, quantity }]`, and the function returns `{ lines: [{ lotId, quantity }], shortfalls: [{ ask, missing }] }`. It SHALL draw from non-`Expired`, non-`Discarded` lots with quantity > 0, ordered by `expiresOn` ascending (lots without expiry last), then by `receivedAt`.
2. THE planned quantity per request item SHALL equal `min(requested, available)`, and SHALL never take more from a lot than that lot holds.
3. THE API Server SHALL expose `POST /api/distributions/plan` (`{ householdId, items }` → plan) and `POST /api/distributions` (`{ householdId, lines }`).
4. WHEN a distribution is committed, THE Distribution Service SHALL, in one transaction, decrement each lot with a conditional update (`quantity >= requested`), set `Depleted` when a lot reaches 0, and create the Distribution. IF any line cannot be fulfilled, THEN no lot SHALL change and the API SHALL return HTTP 409 listing the short lines.
5. A Stock Lot's `quantity` SHALL never be negative.
6. THE Client SHALL provide a `/distribute` page with these steps: pick a household by code (or create one), choose items (category chips plus quantity), review the FEFO pick list with locations, and confirm.

---

### Requirement 6: Pantry Voice Intents

**User Story:** As a coordinator, I want to ask about stock and impact out loud, so that I can answer questions during a busy shift.

#### Acceptance Criteria

1. THE App SHALL register these intents:
   - `EXPIRING_THIS_WEEK` ("what expires this week")
   - `STOCK_OF` ("how much <category or item> do we have"), which sums quantity by unit
   - `HOUSEHOLDS_SERVED` ("how many households did we serve this month")
   - `INTAKE` ("add …" / "log …"), which returns the Intake Draft and the spoken text "I heard … — say confirm or edit it on screen"
2. WHEN the Board role asks `HOUSEHOLDS_SERVED`, THE answer SHALL be an aggregate count only. The answer SHALL be allowed even though Board cannot read `households` or `distributions`, because the intent is declared as aggregate-only.

---

### Requirement 7: Impact Report

**User Story:** As a coordinator, I want a monthly impact PDF, so that I can report to donors and grant funders in one click.

#### Acceptance Criteria

1. THE API Server SHALL expose `POST /api/reports/impact` with `{ month: 'YYYY-MM' }`, readable by Coordinator and Board. It SHALL generate a PDF through the skeleton PDF generator, persist it as a skeleton Report record, and list it with the other reports.
2. THE Impact Report SHALL include:
   - units received (by category)
   - units distributed (by category)
   - households served (distinct)
   - total people reached (sum of household sizes, each household counted once)
   - the waste rate (units discarded or expired ÷ units received)
   - the top 5 donors by units
   - a bar chart image of distributions per week
3. THE Impact Report SHALL contain no household codes.
4. THE demo seed SHALL create 12 donors, 120 lots over the past 60 days (including expiring and expired ones), 45 households and 150 distributions.
