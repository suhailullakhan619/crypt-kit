# End-to-end feature tests

Two scripts drive real Chrome (through `playwright-core`, using the Chrome installed on the machine).

| Script | Runs against | Changes data? | Steps |
|---|---|---|---|
| `features.mjs` | the three apps running locally in demo mode | yes (in-memory demo data) | skeleton 39, lab 51, pantry 41 |
| `live.mjs` | the deployed sites | no, it never submits a form | 36 (every demo role of every app) |

## `features.mjs`: every feature, locally

Covers sign-in per role, CRUD, sign-up with approval, forgot and reset password, change password, reservations, CSV import and export, saved views, Insights, PDF downloads, donor receipts, notifications, the email test button, QR cards and short IDs, typing an ID and scanning a photo of a QR code on the scan page, label sheets, signed-out QR links, every dialog's position on desktop and mobile, mobile layouts, and a sweep for `[object Object]`, `undefined` and `NaN` on every page.

1. Start the three apps in **demo mode** (in-memory data, nothing touches a real database) on these
   ports, each client proxying to its own API:

   | App | API | Client |
   |---|---|---|
   | skeleton | 5001 | 5171 |
   | lab-ledger | 5002 | 5172 |
   | pantry-ghost | 5003 | 5173 |

   Point `SMTP_HOST`, `SMTP_PORT=2525` at a local fake mail server that appends each message as a
   JSON line to `SINK_FILE`, so the email checks never reach a real provider.
2. ```bash
   cd e2e && npm install
   npm test                         # everything
   node features.mjs lab pantry     # only some sections: skeleton | lab | pantry | qr | dialogs | sweep
   ```

Each run changes data (it books slots, imports a lab, saves a donation), so restart the demo apps
before running again for a clean start.

Environment: `SINK_FILE` (default `c:/Kiro/sites/sink.jsonl`), `E2E_APPS=lab` (limit the cross-app
sections `qr`, `dialogs` and `sweep` to the apps that are running), `CHROME_CHANNEL` (default
`chrome`), `HEADED=1` to watch the browser.

## `live.mjs`: read-only check of the deployed sites

```bash
cd e2e && node live.mjs
LIVE_SITES=https://a.netlify.app,https://b.netlify.app node live.mjs   # other deployments
```

For each site: the login page and its one-click demo buttons (waiting up to two minutes for a
sleeping API), the sign-up and forgot-password pages, then for every demo role every sidebar page,
a record's QR card and short ID, the `/scan/<ID>` lookup and the sign-out confirmation (cancelled).
It fails on console errors, failed API calls, server errors and `[object Object]` / `undefined` /
`NaN` on screen.
