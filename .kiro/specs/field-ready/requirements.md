# Requirements Document

## Introduction

"Field-ready" makes the three portals feel like products rather than demos, for the two places they are actually used: on a phone in a lab or a pantry, and in front of a first-time visitor. It adds an installable app with an offline shell, a first-run tour, a way to verify Amazon Polly spoken answers before they go live, and the written material a reviewer needs (demo script, write-up, blog post).

All client changes live in the skeleton and reach Lab Ledger and Pantry Ghost through the normal copy, so Core stays byte-identical (`npm run check:core`).

## Glossary

- **PWA**: a web app the browser can install to the home screen, with its own icon and window.
- **App shell**: the HTML, CSS and JavaScript that draw the interface, as opposed to the records it shows.
- **Tour**: a short sequence of dialogs shown on a user's first visit that points out the three or four things worth knowing.
- **Polly**: Amazon Polly, the optional text-to-speech service that reads chat answers aloud (`VOICE_PROVIDER=polly`).

---

## Requirements

### Requirement 1: Installable app

**User Story:** As a lab technician or pantry volunteer, I want to add the portal to my phone's home screen, so that I can open it like an app and scan labels quickly.

#### Acceptance Criteria

1. THE Client SHALL serve a web app manifest with the app's name, a short name, `display: standalone`, a theme colour, a start URL of `/`, and icons of 192 and 512 pixels (plus a maskable icon).
2. THE manifest and icons SHALL be generated from the app's own logo (`public/favicon.svg`) and name, so that each portal installs with its own identity.
3. THE `index.html` SHALL link the manifest and set `theme-color` and Apple touch icon tags.
4. `npm run summon` SHALL rename the manifest for a new app the same way it renames `index.html`.
5. THE manifest SHALL pass the browser's installability check (name, icons, start URL, standalone display, a registered service worker).

### Requirement 2: Offline shell

**User Story:** As a user with a patchy connection, I want the portal to open and tell me clearly when it is offline, so that I am not looking at a browser error page.

#### Acceptance Criteria

1. THE Client SHALL register a service worker in production builds only (never in development or tests).
2. THE service worker SHALL cache the app shell and static assets, answer navigations from the network first and fall back to the cached shell, and serve hashed assets cache-first.
3. THE service worker SHALL NOT cache any request to the API (`/api/` or a configured API origin), so that records, tokens and another user's data are never kept or shown stale.
4. WHEN a new version is deployed, THE service worker SHALL replace the old caches and take over on the next visit, without keeping stale assets.
5. WHEN the browser goes offline, THE Client SHALL show a banner saying so and that changes cannot be saved, and SHALL remove it when the connection returns.
6. THE hosting config SHALL serve `sw.js` and the manifest with `Cache-Control: no-cache`, so a new deploy is picked up.

### Requirement 3: First-run tour

**User Story:** As a first-time visitor (a judge, a new volunteer), I want a 30-second orientation, so that I find search, the assistant and the scan page without being told.

#### Acceptance Criteria

1. WHEN a user opens the app for the first time in a browser, THE Client SHALL show the tour once, as a dialog with a step counter, Back, Next and Skip.
2. THE tour SHALL cover: what the app is, search everywhere (Ctrl/Cmd+K), the chat assistant (with an example question for this app), scanning QR labels (only when the app has QR codes) and the theme toggle.
3. THE tour SHALL be keyboard operable (Arrow keys, Enter, Escape) and SHALL return focus to the page when closed.
4. THE tour SHALL be remembered per user in the browser and SHALL NOT appear again after it is finished or skipped.
5. THE tour SHALL NOT open automatically in development builds, in tests or in automated browsers; `?tour=1` SHALL open it on demand anywhere.
6. THE search palette SHALL offer "Take the tour" so a user can replay it.

### Requirement 4: Verify Amazon Polly before relying on it

**User Story:** As the owner, I want a one-command check of my AWS setup, so that I know spoken answers work before I turn them on for visitors.

> Re-scoped: this requirement originally covered a Bedrock assistant check (`assistant:test`), which was removed.

#### Acceptance Criteria

1. THE server SHALL provide `npm run voice:test`, which checks the configuration, asks Polly to speak one sentence, saves the audio to the temp folder and prints a clear result.
2. WHEN the call fails, THE script SHALL translate the common AWS errors (missing or wrong credentials, expired credentials, missing permission, unknown voice, unsupported engine) into the action to take.
3. THE script SHALL never print credentials.
4. WHEN `VOICE_PROVIDER` is not `polly`, `POST /api/voice/speak` SHALL answer 400 and the client SHALL use the browser voice; WHEN Polly fails, THE client SHALL fall back to the browser voice.
5. THE repository SHALL document the minimum IAM policy (`polly:SynthesizeSpeech`) and the environment variables (`docs/POLLY.md`).

### Requirement 5: Reviewer-facing material

**User Story:** As a judge, I want to understand the project in three minutes and try it in one, so that I can score it fairly.

#### Acceptance Criteria

1. THE repository SHALL contain a demo script with timings, narration and a shot list (`docs/DEMO_SCRIPT.md`).
2. THE repository SHALL contain a Devpost text draft with testing instructions and demo logins (`docs/DEVPOST.md`), a blog post draft (`docs/BLOG_POST.md`) and social post drafts (`docs/SOCIAL_POSTS.md`).
3. THE write-up (`docs/KIRO_USAGE.md`) SHALL state only what was done with which tool, and SHALL list what the owner still has to fill in from their own Kiro runs.
4. THE README SHALL open with the three live links, an architecture diagram and a "try it in 60 seconds" path, and its screenshots SHALL show the current interface.
