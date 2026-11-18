# End-to-end feature tests

Drives real Chrome through every feature of the three apps (sign-in per role, CRUD, reservations,
CSV import and export, saved views, Insights, PDF downloads, donor receipts, notifications, the
email test button, every dialog's position, mobile layouts, and a sweep for `[object Object]`).

## Run

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
   npm test                      # everything
   node features.mjs lab pantry  # only some sections: skeleton | lab | pantry | dialogs | sweep
   ```

Each run changes data (it books slots, imports a lab, saves a donation), so restart the demo apps
before running again for a clean start.

Environment: `SINK_FILE` (default `c:/Kiro/sites/sink.jsonl`), `CHROME_CHANNEL` (default `chrome`),
`HEADED=1` to watch the browser.
