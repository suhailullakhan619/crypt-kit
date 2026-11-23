# End-to-end feature tests

Two scripts drive real Chrome (through `playwright-core`, using the Chrome installed on the machine).

| Script | Runs against | Changes data? | Steps |
|---|---|---|---|
| `features.mjs` | the three apps running locally in demo mode | yes (in-memory demo data) | skeleton 72, lab 60, pantry 51 |
| `pwa.mjs` | a production build (`vite preview`) or a live site | no (signs in and looks) | 8: installability, service worker, offline shell, no cached API data, the tour |
| `screenshots.mjs` | the three local demo apps | no | writes `docs/screenshots/*.png` for the README |
| `responsive.mjs` | the live sites, or any local copy | no | every page at 5 widths (about 100 screens per site) |
| `themes.mjs` | the three apps running locally in demo mode | no | every page and chat answer, dark and light, desktop and phone (about 490 screens) |
| `live.mjs` | the deployed sites | no, it never submits a form | 36 (every demo role of every app) |

## `features.mjs`: every feature, locally

Covers sign-in per role, CRUD, sign-up with approval, forgot and reset password, change password, reservations, CSV import and export, saved views, Insights, PDF downloads, donor receipts, notifications, the email test button, QR cards and short IDs, typing an ID and scanning a photo of a QR code on the scan page, label sheets, signed-out QR links, whole-row clicks, column sorting, the Ctrl+K search palette, comments (post, reload, delete), board moves, calendar, the Mine filter, subtasks, duplicate, the chat assistant (plain-words questions, links in answers, confirm and cancel on commands, a reminder in the India timezone), every dialog's position on desktop and mobile, mobile layouts, and a sweep for `[object Object]`, `undefined` and `NaN` on every page.

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
   node features.mjs lab pantry     # only some sections: skeleton | lab | pantry | qr | ux | modules | chat | dialogs | sweep
   ```

Each run changes data (it books slots, imports a lab, saves a donation), so restart the demo apps
before running again for a clean start.

Environment: `SINK_FILE` (default `c:/Kiro/sites/sink.jsonl`), `E2E_APPS=lab` (limit the cross-app
sections `qr`, `ux`, `dialogs` and `sweep` (`modules` always runs against Crypt Kit) to the apps that are running), `CHROME_CHANNEL` (default
`chrome`), `HEADED=1` to watch the browser.

## `themes.mjs`: dark and light, every page

```bash
cd e2e && node themes.mjs            # all three apps
node themes.mjs skeleton lab         # only some
```

Signs in as each app's admin role and opens every page (lists, detail, new, Board and Calendar views, the search palette, Edit, notifications and sign-out dialogs) in dark and light, at 1440 px and 375 px, and also the signed-out pages. For each screen it saves a screenshot to `c:/Kiro/sites/logs/themes/` (set `THEME_OUT` to change that) and checks the page for text below WCAG AA contrast (4.5:1, or 3:1 for large text), form controls that stayed white in dark mode, a theme that did not switch, and sideways scrolling. It exits with 1 if anything is flagged. Run it after changing colours or shared components.

## `pwa.mjs`: installable, offline-ready, tour

```bash
cd e2e && node pwa.mjs https://crypt-kit.netlify.app       # a live site
node pwa.mjs http://localhost:4171                         # a local production build (see below)
```

Needs a **production** build, because the service worker and the tour only run there. Locally: `npm run build --prefix skeleton/client`, start the API in demo mode, then `npx vite preview --port 4171` in `skeleton/client` (it proxies `/api` like the dev server). The check looks like a real browser (it hides `navigator.webdriver`) and covers: the manifest and its tags, Chrome's own installability errors, the service worker taking control, the cache holding the shell and **nothing from the API**, the app opening offline, the banner, and the first-run tour (opens once, Skip is remembered, replay from search).

## `screenshots.mjs`: README images

```bash
cd e2e && node screenshots.mjs          # all three; E2E_APPS=lab for one
```

Needs the demo apps running (dev servers, ports 5171 to 5173). Replaces the 23 images in `docs/screenshots/`. Run it after the interface changes and commit the result.

## `responsive.mjs`: every page at five screen widths

```bash
cd e2e && npm run responsive                              # the three live sites
node responsive.mjs http://localhost:5172                 # one local copy
```

Signs in with the first one-click demo role and opens every page (lists, detail, new, Board and Calendar, the search palette, the chat with an answer, notifications and the phone menu) at 320, 375, 768, 1024 and 1440 px, with touch emulation on phones and tablets. It flags a page that scrolls sideways, elements sticking out past the screen edge (outside a deliberate scroll area), tap targets smaller than 24 x 24 px (WCAG 2.5.8) and a missing viewport tag. Screenshots go to `c:/Kiro/sites/logs/responsive/`. It exits with 1 if anything is flagged.

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
