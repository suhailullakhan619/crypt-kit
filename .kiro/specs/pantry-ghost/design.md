# Design Document

## Overview

Pantry Ghost is `/skeleton` copied by `npm run summon -- pantry-ghost` and extended only through extension points (skeleton Req 16). Where Lab Ledger stresses lifecycle workflows on unique items, Pantry Ghost stresses three other things:

1. **Quantities split across transactions.** FEFO planning plus atomic, conditional decrements.
2. **Time-based classification with per-category windows.** This uses an app job, because the skeleton's single-state Due Rule is too simple here. That gap demonstrates why the `jobs/app` extension point exists.
3. **Voice that writes.** Natural-language intake becomes a draft that a person confirms.
4. **Privacy by design.** Household records hold no PII, the Board role sees only aggregates, and the `aggregateOnly` intents serve those aggregates.

---

## App-Specific Structure

```
pantry-ghost/
├── server/
│   ├── crypt.config.js                 # roles: Coordinator, Volunteer, Board; theme: lantern
│   └── src/
│       ├── resources/   donors.js · stock-lots.js · households.js · distributions.js
│       ├── domain/      classifyExpiry.js · parseIntake.js · planFefo.js · numberWords.js
│       │                dateWords.js · categoryKeywords.js · expiryWindows.js   # all pure
│       ├── routes/app/  intake.js · distributions.js · impact.js
│       ├── controllers/ intakeController.js · distributionController.js · impactController.js
│       ├── services/    intakeService.js · distributionService.js · impactService.js
│       ├── jobs/app/    classifyExpiry.job.js   # hourly + at boot
│       ├── intents/     expiringThisWeek.js · stockOf.js · householdsServed.js · intake.js
│       ├── dashboard/   useFirst.js · thisMonth.js
│       └── seed/        pantry.seed.js
└── client/src/
    ├── appRoutes.jsx                   # /intake, /distribute
    ├── pages/        Intake.jsx · Distribute.jsx
    ├── components/pantry/ DraftRow.jsx · HouseholdPicker.jsx · ItemChips.jsx · PickList.jsx
    ├── dashboard/    useFirst.jsx · thisMonth.jsx
    └── theme/        tokens.css (lantern)
```

`src/domain/` is a new folder for pure domain functions. It follows the skeleton convention "pure first, then property-test".

---

## Resource Definitions (abridged)

> **Note:** Refs name resource keys (`ref: 'donors'`, `ref: 'households'`) or `'User'`; the model-name style in the snippets below (`ref: 'Donor'`) predates skeleton task 4.1.

```js
// stock-lots.js
defineResource({
  key: 'stock-lots', label: 'Stock', icon: 'package', titleField: 'itemName',
  fields: {
    itemName:  { type: 'string', required: true, list: true, search: true },
    category:  { type: 'enum', values: CATEGORIES, required: true, list: true, filter: true },
    quantity:  { type: 'number', required: true, min: 0, list: true },
    unit:      { type: 'enum', values: ['item','can','box','kg','lb','L'], default: 'item', list: true },
    expiresOn: { type: 'date', list: true },
    donor:     { type: 'ref', ref: 'Donor', filter: true },
    location:  { type: 'enum', values: ['Shelf','Fridge','Freezer'], default: 'Shelf', filter: true },
    status:    { type: 'enum', values: ['Fresh','ExpiringSoon','Expired','Depleted','Discarded'], default: 'Fresh', list: true, filter: true },
    receivedAt:{ type: 'date' },
  },
  permissions: { read: ['Volunteer','Board'], create: ['Volunteer'], update: ['Volunteer'], delete: [] },
  statusFlow: { field: 'status', workflowOnly: ['Depleted','Expired','ExpiringSoon'],
                transitions: { Fresh: ['Discarded'], ExpiringSoon: ['Discarded'], Expired: ['Discarded'], Depleted: [], Discarded: [] } },
  softDelete: { field: 'status', value: 'Discarded', at: 'discardedAt' },
  hooks: { beforeCreate: (d, ctx) => ({ ...d, receivedAt: d.receivedAt ?? ctx.now, status: classifyExpiry(d, ctx.now, WINDOWS) }) },
  report: { columns: ['itemName','category','quantity','unit','expiresOn','location','status'] },
  voice: { synonyms: ['stock', 'lots', 'food', 'items'] },
});

// households.js — no PII by construction (Req 2.4)
defineResource({
  key: 'households', label: 'Households', icon: 'home', titleField: 'code',
  fields: {
    code:    { type: 'string', unique: true, list: true, search: true },
    size:    { type: 'number', required: true, min: 1, max: 20, list: true },
    dietary: { type: 'enum', multiple: true, values: ['Vegetarian','Halal','Kosher','GlutenFree','NutAllergy','Diabetic'], list: true, filter: true },
  },
  permissions: { read: ['Volunteer'], create: ['Volunteer'], update: ['Volunteer'], delete: [] }, // Board excluded
  hooks: { beforeCreate: async (d, ctx) => ({ ...d, code: await nextHouseholdCode(ctx.session) }) },
});

// distributions.js
fields: { household: ref Household, lines: hidden [{ lot: ref, itemName, category, quantity, unit }],
          totalUnits: number, volunteer: ref User, at: date }
permissions: { read: ['Volunteer'], create: [], update: [], delete: [] }
```

The `lines` field is a sub-document array added through the definition's `extendSchema(schema)` callback (skeleton Req 16.8), so it exists before the model compiles. It is hidden from meta, and the detail page renders it through a custom panel.

---

## Pure Domain Functions

### `classifyExpiry(lot, now, windows)`

```
if lot.status === 'Discarded'         → 'Discarded'
if lot.quantity <= 0                  → 'Depleted'
if !lot.expiresOn                     → 'Fresh'
d = daysBetween(startOfDay(now), startOfDay(lot.expiresOn))
if d < 0                              → 'Expired'
if d <= windows[lot.category]         → 'ExpiringSoon'
                                      → 'Fresh'
```

### `parseIntake(text, { donors, now })`

This is a pipeline of small pure parsers. Each consumes tokens and returns `{ value, rest }`.

```
normalise → extractDonor ("from <name>", fuzzy ≤ 2) → extractDate ("expir(es|ing) <date>", "best before <date>")
          → extractQuantity (numerals | numberWords) → extractUnit (cans?, boxes?, kilos?|kg, pounds?|lbs?, litres?|L)
          → itemName = remaining tokens minus fillers ("of", "a", "some")
          → category = categoryKeywords lookup (longest match wins)
confidence = filled required fields / 5 ; missing = unfilled required fields
```

`dateWords.js` handles:
- month names and abbreviations with ordinals ("3rd", "third")
- `YYYY-MM-DD`
- relative forms ("tomorrow", "next <weekday>", "in N days|weeks")

When no year is given, it rolls forward to the next future occurrence (Req 4.3).

### `planFefo(request, lots)`

```
eligible = lots.filter(l => l.quantity > 0 && !['Expired','Discarded','Depleted'].includes(l.status))
sorted   = eligible.sort(by expiresOn asc (nulls last), then receivedAt asc, then _id)
remaining = new Map(lot._id → quantity)
for item in request:
  need = item.quantity
  for lot in sorted where matches(item, lot) and remaining[lot] > 0:
     take = min(need, remaining[lot]); push line; remaining[lot] -= take; need -= take
     if need === 0 break
  if need > 0 → shortfalls.push({ ask: item, missing: need })
```

`remaining` is shared across request items, so two items that match the same lot never over-draw it (Req 5.2).

---

## Distribution Service

```
commit({ householdId, lines }, user, now)   withTransaction(s):
  household = Household.findById(householdId).session(s) → 404
  short = []
  for line in lines:
    r = StockLot.updateOne({ _id: line.lot, quantity: { $gte: line.quantity }, status: { $nin: ['Expired','Discarded','Depleted'] } },
                           { $inc: { quantity: -line.quantity } }, { session: s })
    if r.modifiedCount === 0 → short.push(line)
  if short.length → throw httpError(409, 'Insufficient stock', { short })      // aborts txn → no lot changed
  StockLot.updateMany({ _id: { $in: lineLotIds }, quantity: 0 }, { status: 'Depleted' }, { session: s })
  create Distribution; activity on distribution + each lot
```

---

## Impact Report

`impactService.generate(month, user)` aggregates for the month window:
- intake: `$group` stock-lots by category on `receivedAt`
- distribution lines: `$unwind` lines, then group by category
- distinct households and the sum of their sizes
- waste: lots that became `Expired` or `Discarded` in the window, taken from the activity log `status` entries
- the top donors

It then calls `reportService.createReport({ title: 'Impact — <Month YYYY>', resource: 'stock-lots', filters: { month }, render })`. `render` uses the skeleton helpers `heading`, `kv`, `table` and `barChart` (weekly distributions). The report never includes household codes (Req 7.3).

---

## API Endpoints (app-specific)

| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/api/intake/parse` | Coordinator, Volunteer | `{ text }` → draft |
| POST | `/api/intake` | Coordinator, Volunteer | `{ lots: [...] }` → 201 `{ items }` |
| POST | `/api/distributions/plan` | Coordinator, Volunteer | `{ householdId, items }` → `{ lines, shortfalls }` |
| POST | `/api/distributions` | Coordinator, Volunteer | `{ householdId, lines }` → 201; 409 with `short` |
| POST | `/api/reports/impact` | Coordinator, Board | `{ month }` → 201 `{ report }` |

---

## Voice Intents

| Intent | Example | Notes |
|---|---|---|
| `INTAKE` | "add twelve cans of black beans expiring March 3rd from Fresh Mart" | returns the draft in `data`. The client's voice page and Intake page both show a confirm card. **Never saves.** |
| `EXPIRING_THIS_WEEK` | "what expires this week" | lots with `expiresOn` ≤ now + 7d that are not depleted, discarded or expired; top 5 spoken |
| `STOCK_OF` | "how much canned food do we have" | sums quantity per unit for a matched category or item name |
| `HOUSEHOLDS_SERVED` | "how many households did we serve this month" | `aggregateOnly: true, requires: ['Coordinator','Volunteer','Board']` |

---

## Client

- **`Intake.jsx`:** a large microphone button (uses the skeleton's `useRecorder`/`useSpeech`) plus a text box. Each utterance calls `/intake/parse` and appends a `DraftRow` with editable fields. Missing fields have an ember outline and the hint "The ghost didn't catch the expiry date". Pressing "Save all" triggers `POST /intake`, a toast "12 lots tucked into the pantry", and clears the rows.
- **`Distribute.jsx`:** a 3-step stepper:
  1. `HouseholdPicker`: search by code, or "New household" with size and dietary chips.
  2. `ItemChips`: category chips with +/- quantity. Dietary flags warn, for example on NutAllergy items.
  3. `PickList`: FEFO lines grouped by location (Fridge → Freezer → Shelf), with checkboxes to tick lots off while picking, then Confirm.
- **Dashboard panels:** `useFirst` (expiring-soon cards that glow brighter as expiry nears; the glow is disabled under reduced motion) and `thisMonth` (units in/out, households served, waste rate).
- **Theme `lantern`:** `--background: 20 14% 8%`, `--primary: 28 92% 55%` (pumpkin), `--accent: 45 95% 65%` (candle). The mascot is an inline-SVG ghost holding a lantern, used in empty states ("Nothing spooky in the pantry yet").

---

## Correctness Properties

### Property P1: Stock Never Goes Negative
For any initial lots and any sequence of concurrent distribution commits, every lot's quantity stays ≥ 0, and the sum of distributed quantities per lot equals its initial quantity minus its final quantity.
**Validates: Requirements 5.4, 5.5**

### Property P2: Failed Distributions Change Nothing
For any commit where at least one line exceeds available stock, all lot quantities and statuses, and the distribution count, are unchanged afterwards.
**Validates: Requirements 5.4**

### Property P3: FEFO Plan Is Valid and Earliest-First
For any lots and request, `planFefo` never assigns more than a lot holds (summed across request items) and never uses an Expired, Discarded or Depleted lot. For each request item, `min(requested, available)` units are planned. No unused eligible lot with an earlier expiry exists while a later-expiring lot of the same match is used.
**Validates: Requirements 5.1, 5.2**

### Property P4: Expiry Classification Is Total and Monotonic
For any lot and `now`, `classifyExpiry` returns exactly one status. As `now` advances with the quantity fixed, the status never moves backwards in the order Fresh → ExpiringSoon → Expired.
**Validates: Requirements 3.1**

### Property P5: Intake Parser Round Trip
For any generated `{ quantity ≤ 100 (as numeral or words), unit, itemName from the keyword table, date (in any supported format), donor name with ≤ 2 typos }` rendered through random sentence templates, `parseIntake` recovers the same quantity, unit, category, expiry date (with the year-rollover rule) and donor id.
**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property P6: Households Never Hold PII and Board Never Sees Them
For any request body sent to create or update a household, the stored document has only `code`, `size`, `dietary` and system fields. For the Board role, `/api/meta`, `/api/r/households`, the voice answers and the impact PDF text contain no household code.
**Validates: Requirements 2.3, 2.4, 6.2, 7.3**

---

## Testing Strategy

The skeleton suites run unchanged. App suites:
- Pure property tests: P3, P4 and P5, the last with a sentence-template generator in `test/generators/intake.js`.
- DB-backed: P1 (concurrent `Promise.all` commits against a memory replica set), P2 and P6.
- Integration: voice intake draft → confirm → plan → commit → impact report includes the units.
- Client: an Intake draft row highlights missing fields; the Distribute stepper blocks Confirm while shortfalls exist.
