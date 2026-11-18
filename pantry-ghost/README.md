# 🏮 Pantry Ghost

Inventory for community food banks, raised from the [Crypt Kit skeleton](../skeleton). Speak a donation in, hand out the food that expires first, and print the month's impact for funders in one click.

Live demo: https://pantry-ghost.netlify.app (one-click demo buttons on the login page). It also has every [shared feature](../README.md#shared-features-every-app-gets-them-from-the-skeleton): sign-up with approval, password reset by email, notifications with email, CSV import/export, saved views and themed PDFs.

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

6. **Donor receipts** (donor detail page, Coordinator and Volunteer): pick a period, see how many donations and units that donor gave, and download a thank-you PDF listing each donation with the quantity originally received. API: `GET /api/donors/:id/receipt/preview`, `POST /api/donors/:id/receipt`.
7. **Expiry notifications**: the hourly job sends one summary per status per day ("3 lots have expired") to the Coordinator and Volunteers, never the Board.

8. **Insights** (`/insights`, Coordinator and Volunteer): usable stock per category against a minimum (edit the numbers in `server/src/domain/lowStock.js`), and waste by donor, meaning how much of what each donor gave expired or was discarded. A daily job at 08:00 notifies staff about each low category, once a week per category. *Download PDF* stores the report with the others. API: `GET /api/insights`, `POST /api/insights/report`.
9. **Item IDs and QR labels**: every stock lot gets a short ID (`SL-0001`, set on create and backfilled at boot for older lots). Its detail page has a QR card (download PNG, print one label, copy link). On the Stock list, tick rows → *Print QR labels* for an A4 sheet of 3 × 8 labels.
10. **Scan or find** (`/scan`, every role): scan a shelf label with the camera, a photo or a screenshot, or type the ID, to open the lot. The QR opens `<CLIENT_URL>/scan/SL-0001`, so any phone camera works; a signed-out visitor signs in first and then lands on the lot.

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
npm test --prefix server                    # Jest, 243 tests: skeleton suites + Pantry Ghost properties P1–P6, integration
npm test --prefix client                    # Vitest, 103 tests: lantern contrast, intake drafts, FEFO stepper, voice confirm card, scan
npm run smoke --prefix server               # boots demo mode and walks the demo path over HTTP (30 checks)
```

The server runs two Jest projects. **core** runs the skeleton's own suites unchanged against the skeleton's reference config (`test/core/crypt.config.js`). **app** runs this app's suites against the real `crypt.config.js`.

| Property | What it guarantees |
|---|---|
| P1 | Concurrent distributions never drive stock below zero; distributed = received − remaining |
| P2 | A distribution with any short line changes nothing (lots, statuses, distributions, activity) |
| P3 | The FEFO plan never over-draws, never uses expired lots, and always takes the earliest expiry first |
| P4 | Expiry classification is total and never moves backwards in time |
| P5 | Intake sentences round-trip: quantity, unit, category, expiry date and donor survive any template |
| P6 | Households hold no personal data and Board never sees a household code |

## How it extends the skeleton

The core (`server/src/core`, `server/src/middleware`, `server/test/core`, `server/jest.config.js`, `client/src/components/resource`, `client/src/lib/can.js`) is byte-identical to `/skeleton` (`node scripts/check-core.js`). Everything Pantry Ghost adds goes through extension points:

| Extension point | Used for |
|---|---|
| `server/src/resources/*.js` | donors, stock-lots (hooks + `extendSchema` for `receivedQuantity`), households (auto code), distributions (`lines` via `extendSchema`, generic writes denied) |
| `server/src/domain/` | pure `classifyExpiry`, `parseIntake`, `planFefo`, with number, date and category vocabularies |
| `server/src/routes/app/` | `/api/intake`, `/api/distributions`, `/api/reports/impact`, donor receipts, `/api/insights` |
| `server/src/jobs/app/` | hourly expiry classification, daily low-stock alerts, item-ID backfill |
| `server/src/intents/` | INTAKE, EXPIRING_THIS_WEEK, STOCK_OF, HOUSEHOLDS_SERVED (aggregate-only) |
| `server/src/dashboard/` + `client/src/dashboard/` | Use first, This month |
| `client/src/voice/` | INTAKE confirm card, expiring list |
| `client/src/appRoutes.jsx` | Intake, Distribute, Scan or find, Insights and Impact report pages, report presets and the *Print QR labels* bulk action |
| `client/src/qrCodes.js` | which records get QR codes (stock lots, by `code`) |
| `client/src/theme/tokens.css` + `Logo` | the lantern theme and the ghost-with-a-lantern mascot |

## Screenshots

_Captured from a real browser run (Chrome, demo data), in [`docs/screenshots/`](../docs/screenshots)._

- `docs/screenshots/pantry-dashboard.png`: Use first board and This month
- `docs/screenshots/pantry-intake.png`: voice intake drafts with a missing field highlighted
- `docs/screenshots/pantry-distribute.png`: FEFO pick list grouped by location
- `docs/screenshots/pantry-impact.png`: impact report preview and PDF
- `docs/screenshots/pantry-insights.png`, `pantry-insights-mobile.png`: low stock and waste by donor
- `docs/screenshots/pantry-donor-receipt.png`: donor receipt preview
