# Implementation Plan: Field-ready

## Overview

Build in the order: offline-safe shell, tour, assistant check, then the written material. Every client task lands in `skeleton/client` and is copied to the apps; `npm run check:core` must stay green.

## Tasks

- [x] 1. Installable app and offline shell
  - [x] 1.1 Add `public/manifest.webmanifest`, link it from `index.html` with `theme-color` and Apple touch icon; write `scripts/make-icons.mjs` and generate the icon set for all three apps
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 Extend `scripts/summon.js` to rename the manifest; add a test to `scripts/summon.test.js`
    - _Requirements: 1.4_
  - [x] 1.3 Write `public/sw.js` and `src/lib/registerSW.js`; stamp a content hash into `dist/sw.js` from `vite.config.js`; add the `[[headers]]` block to each `netlify.toml`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_
  - [x] 1.4 Add `OfflineBanner` and mount it in `AppShell`
    - _Requirements: 2.5_
  - [x]* 1.5 Write unit tests for `registerSW`, `OfflineBanner` and a build-output test
    - _Requirements: 1.1, 2.1, 2.5_
- [x] 2. First-run tour
  - [x] 2.1 Write `lib/tour.js` (`buildSteps`, `tourKey`, `shouldAutoOpen`) with tests
    - _Requirements: 3.2, 3.4, 3.5_
  - [x] 2.2 Write `Tour.jsx`, mount it in `AppShell`, add "Take the tour" to the palette
    - _Requirements: 3.1, 3.3, 3.6_
  - [x]* 2.3 Write component tests for steps, keyboard, remember-once and replay
    - _Requirements: 3.1, 3.3, 3.4, 3.6_
- [x] 3. Checkpoint: client suites, builds and `check:core` pass in all three apps
- [x] 4. Assistant check
  - [x] 4.1 Write `server/scripts/assistant-test.js` with `explainAwsError`; add `npm run assistant:test`; add the `assistant` flag to `/api/health`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x]* 4.2 Write unit tests for `explainAwsError` and the health flag
    - _Requirements: 4.2, 4.4_
  - [x] 4.3 Write `docs/BEDROCK.md`
    - _Requirements: 4.5_
- [x] 5. Browser verification on a production build
  - [x] 5.1 Serve each portal's production build, and check manifest, service worker, offline shell, no cached API calls, tour once-only
    - _Requirements: 1.5, 2.2, 2.3, 3.1, 3.4_
- [x] 6. Reviewer-facing material
  - [x] 6.1 Refresh screenshots (`e2e/screenshots.mjs`) and the README opening: live links, architecture diagram, 60-second path
    - _Requirements: 5.4_
  - [x] 6.2 Write `docs/DEMO_SCRIPT.md`, `docs/DEVPOST.md`, `docs/BLOG_POST.md`, `docs/SOCIAL_POSTS.md`
    - _Requirements: 5.1, 5.2_
  - [x] 6.3 Rewrite `docs/KIRO_USAGE.md` with only what was actually done, and list what the owner must still fill in
    - _Requirements: 5.3_
- [ ] 7. Final checkpoint: all suites, browser runs and the live sites
