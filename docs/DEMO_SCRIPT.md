# Demo video script (under 3:00)

Use one browser window at 1440px for most of the video, with a phone-width window ready for the 375px shot. Run every app with `DEMO_MODE=true`, so judges see exactly what they'll get when they run it themselves.

| Time | Screen | Say (roughly) |
|---|---|---|
| 0:00–0:15 | Repo root on GitHub: `/skeleton`, `/lab-ledger`, `/pantry-ghost`, `/.kiro` | "Internal tools all need the same bones: logins and roles, records, overdue alerts, reports, and lately voice. Crypt Kit is a lean skeleton that grows those bones from one file per resource. To prove it, we raised two very different apps from it." |
| 0:15–0:40 | `skeleton/server/src/resources/notes.js` beside the running skeleton app | "This one definition gives you the API, role checks, list, filters, form, status buttons, history, dashboard, overdue sweeper, PDF report and voice questions. No client code." Click a status transition, then show the history. |
| 0:40–1:25 | **Lab Ledger** | Sign in as Student, scan a QR label at 375px, request the oscilloscope. Switch to Technician and approve; the dashboard's "Out right now" updates. Approve the same item twice to show the 409. Ask by voice: "Who has the oscilloscope?" Generate the Calibration Audit PDF. |
| 1:25–2:15 | **Pantry Ghost** | Sign in as Volunteer, open Intake and say "add twelve cans of black beans expiring March third from Fresh Mart". The draft row appears; save it. Open Distribute, pick a household, choose Canned ×6, and walk the first-expiry-first-out pick list. Show the "Use First" board. As Board, ask "how many households did we serve this month" (an aggregate only, never names). Generate the Impact report PDF. |
| 2:15–2:45 | `.kiro/` folder: specs, steering, hooks; one property-test file | "Everything started as Kiro specs: requirements, design with 31 correctness properties, and task lists. Steering kept the layering consistent. Hooks run related tests and keep Core identical across apps. Property tests caught real bugs." Name one concrete counterexample from the journal. |
| 2:45–3:00 | Split screen of both apps, light and dark | "One skeleton, two apps, zero Core edits. Crypt Kit: raise your internal tools from the dead." |

## Before recording

- Run `npm run check:core`, so you can say "zero Core edits" truthfully.
- Run `npm test` at the repo root and have the green output ready for a 2-second cut.
- Use only original assets: the logos are inline SVGs made for this project. Use no copyrighted music.
