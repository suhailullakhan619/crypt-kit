# 🏮 Pantry Ghost

Inventory for community food banks, raised from the [Crypt Kit skeleton](../skeleton). Speak a donation in, hand out the food that expires first, and print the month's impact for funders in one click.

## The problem

- **Food expires on shelves** because nobody can see what to use first.
- **Intake is slow.** Volunteers' hands are full of boxes, not keyboards.
- **Grant reports are assembled by hand** from paper tallies at the end of the month.

## Who uses it

| Role | Who | What they do |
|---|---|---|
| **Coordinator** (superuser) | Runs the food bank | Everything: donors, stock, households, distributions, users, impact reports |
| **Volunteer** | Shift volunteers | Log donations (voice or typed), register households, pack FEFO boxes |
| **Board** | Trustees and funders | Read-only: stock, the dashboard, aggregate voice answers and the impact report — **never household records** |

## Privacy stance

- A household is **a code (`H-0042`), a size and dietary flags**. There is no field for a name, address, phone or email, and the API strips any field that is not declared, so such data cannot be stored even by mistake (property test P6).
- **Board never sees a household code**: not in `/api/meta`, record lists, the dashboard, voice answers or the impact PDF (P6 checks all five).
- "How many households did we serve?" is an **aggregate-only** voice intent: Board may ask it, and it returns counts only.
- Donor contacts are for organisations; recipients are never contacted through the app.

## Demo accounts

In demo mode the login page shows one-click buttons for these accounts.

| Role | Email | Password |
|---|---|---|
| Coordinator | coordinator@pantry.test | pantry-coordinator-demo |
| Volunteer | volunteer@pantry.test | pantry-volunteer-demo |
| Board | board@pantry.test | pantry-board-demo |

The demo seed creates 12 donors, 120 lots received over the past 60 days (fresh, expiring soon, expired, depleted and discarded), 45 households and 150 FEFO distributions. Stock math is exact: every lot's quantity equals what was received minus what was distributed.

## Resources

| Resource | Key fields | Read | Create | Update | Delete |
|---|---|---|---|---|---|
| **Donors** | name, type (Individual · Grocery · Farm · Business · FoodDrive), contact, notes | Coordinator, Volunteer | Coordinator, Volunteer | Coordinator | Coordinator |
| **Stock** (`stock-lots`) | itemName, category, quantity, unit, expiresOn, donor, location, status, receivedAt | all roles | Coordinator, Volunteer | Coordinator, Volunteer | Coordinator (soft delete → `Discarded`) |
| **Households** | code (auto, `H-` + 4 digits), size 1–20, dietary (multi) | Coordinator, Volunteer | Coordinator, Volunteer | Coordinator, Volunteer | — |
| **Distributions** | household, lines (lot, item, category, quantity), totalUnits, packed by, date | Coordinator, Volunteer | workflow only | workflow only | — |

Lot status is derived, never typed: `Fresh` → `ExpiringSoon` (within the category window: Produce 2 days, Dairy 3, Bakery 2, Frozen 14, Canned 30, Dry 30, Hygiene 0) → `Expired`, plus `Depleted` at zero and `Discarded` when a coordinator removes it. An hourly job (also at boot) re-classifies every lot and logs each change.

## Workflows

1. **Intake** (`/intake`): tap the microphone (or type) and say *"twelve cans of black beans expiring March 3rd from Fresh Mart"*. Each utterance becomes an editable draft row; anything the ghost didn't catch is outlined. **Save all** is the only thing that writes stock. The parser understands number words up to one hundred, units and plurals, dates such as "March 3rd", "3 March", "2027-03-03", "next Friday" and "in 2 weeks" (with year rollover), and donor names with up to two typos.
2. **Distribute** (`/distribute`): pick a household by code (or register one), choose category quantities (dietary flags raise warnings, e.g. nut allergy on dry goods), then review the **first-expiry-first-out pick list** grouped Fridge → Freezer → Shelf. Confirm commits in one transaction with conditional decrements: if any line is short, nothing changes and the API answers 409.
3. **Voice agent** (`/voice`): *"what expires this week?"*, *"how much canned food do we have?"*, *"how many households did we serve this month?"*, and *"add …"*, which shows a confirm card and never saves until you tap or say "confirm".
4. **Impact report** (`/impact`, Coordinator and Board): pick a month to preview, then generate a PDF with units received and distributed by category, distinct households served, people reached, the waste rate, the top 5 donors and a weekly distributions chart. It is listed with the other reports.
5. **Dashboard**: a **Use first** board of expiring-soon lots (they glow brighter as expiry nears) and **This month** totals.

## Run it (no database needed)

```bash
npm install --prefix server && npm install --prefix client
cp server/.env.example server/.env        # DEMO_MODE=true by default
npm run dev --prefix server               # API on http://localhost:5000
npm run dev --prefix client               # app on http://localhost:5173
```

The first run downloads a MongoDB binary (about 600 MB, cached in `server/node_modules/.cache`). Voice works in the browser through the Web Speech API. Set `OPENAI_API_KEY` to use Whisper and TTS instead. Environment variables are documented in [`server/.env.example`](server/.env.example) and the [skeleton README](../skeleton/README.md).

## Tests

```bash
npm test --prefix server                    # Jest: skeleton suites + Pantry Ghost properties P1–P6, integration
npm test --prefix client                    # Vitest: lantern contrast, intake drafts, FEFO stepper, voice confirm card
SMOKE_PORT=5062 npm run smoke --prefix server   # boots demo mode and walks the whole demo path over HTTP
```

The server runs two Jest projects. **skeleton** runs the skeleton's own suites unchanged against the skeleton's role names. **pantry** runs this app's suites against the real `crypt.config.js`.

| Property | What it guarantees |
|---|---|
| P1 | Concurrent distributions never drive stock below zero; distributed = received − remaining |
| P2 | A distribution with any short line changes nothing (lots, statuses, distributions, activity) |
| P3 | The FEFO plan never over-draws, never uses expired lots, and always takes the earliest expiry first |
| P4 | Expiry classification is total and never moves backwards in time |
| P5 | Intake sentences round-trip: quantity, unit, category, expiry date and donor survive any template |
| P6 | Households hold no personal data and Board never sees a household code |

## How it extends the skeleton

The core is byte-identical to `/skeleton` (`node scripts/check-core.js`). Everything Pantry Ghost adds goes through extension points:

| Extension point | Used for |
|---|---|
| `server/src/resources/*.js` | donors, stock-lots (hooks + `extendSchema` for `receivedQuantity`), households (auto code), distributions (`lines` via `extendSchema`, generic writes denied) |
| `server/src/domain/` | pure `classifyExpiry`, `parseIntake`, `planFefo`, with number, date and category vocabularies |
| `server/src/routes/app/` | `/api/intake`, `/api/distributions`, `/api/reports/impact` |
| `server/src/jobs/app/` | hourly expiry classification |
| `server/src/intents/` | INTAKE, EXPIRING_THIS_WEEK, STOCK_OF, HOUSEHOLDS_SERVED (aggregate-only) |
| `server/src/dashboard/` + `client/src/dashboard/` | Use first, This month |
| `client/src/voice/` | INTAKE confirm card, expiring list |
| `client/src/appRoutes.jsx` | Intake, Distribute, Impact report pages, plus report presets |
| `client/src/theme/tokens.css` + `Logo` | the lantern theme and the ghost-with-a-lantern mascot |

## Screenshots

_Placeholders, to be captured for the submission:_

- `docs/screenshots/pantry-dashboard.png`: Use first board and This month
- `docs/screenshots/pantry-intake.png`: voice intake drafts with a missing field highlighted
- `docs/screenshots/pantry-distribute.png`: FEFO pick list grouped by location
- `docs/screenshots/pantry-impact.png`: impact report preview and PDF
