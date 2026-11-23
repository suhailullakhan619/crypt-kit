# Devpost submission text

Paste each block into the matching Devpost field. Lines in `[square brackets]` are for you to fill in or confirm. Category: **Skeleton Crew**.

---

## Project name
Crypt Kit

## Elevator pitch (under 200 characters)
A skeleton that turns a few record definitions into a full app: permissions, screens, PDFs, QR labels and a chat assistant. Three live apps prove it: a to-do suite, a lab tracker, a food-bank inventory.

## Inspiration

Small teams run on spreadsheets and paper. A teaching lab cannot tell who has the oscilloscope. A food bank throws away what expired on the shelf because nobody can see what to use first. Every one of those tools needs the same ten things (sign-in, roles, lists, forms, history, notifications, reports, search, mobile) and then a little of what makes it theirs. Teams never get the ten things right, so the tool stays a spreadsheet.

I wanted the ten things done once, properly, so that the next tool is a handful of files. The Skeleton Crew category asked for exactly that: a reusable skeleton, shown with more than one app.

## What it does

**Crypt Kit is a skeleton.** You describe a kind of record once, as a *resource definition*: its fields, who may read and write it, the statuses it moves through, and when it becomes overdue. From that one file the skeleton gives you a REST API with role-based access, list, form, detail and history screens, a dashboard, board and calendar views, comments and subtasks, CSV import and export, PDF reports, QR codes and labels, notifications and email, search across everything, an installable offline-ready phone app and a chat assistant.

**Three apps are raised from it and live now:**

- **Crypt Kit**, the skeleton as a to-do suite: notes with subtasks and comments, projects, reminders (you are told when one is missed), goals whose progress follows their ticked milestones, and a time log.
- **Lab Ledger**, for teaching labs: request, approve and return equipment (two people can never both win the same item), reservations, calibration schedules that raise their own alerts, QR asset tags and printable label sheets, usage insights.
- **Pantry Ghost**, for food banks: say a donation and it drafts the stock entry, packs boxes first-expiry-first-out, warns about expiry and low stock, prints thank-you receipts and monthly impact reports. It never stores a household's name or address, and a test proves the Board role can never see a household code.

**The chat assistant** answers in plain words from your own data: "which items are overdue", "total minutes I logged this week", "what is on my plate", "tell me about LL-0007". Answers link to the records. It only reads, and only what the asker may see. Commands ("add a note to buy candles due friday", "remind me tomorrow at 5pm", "log 30 minutes on the report", "mark N-0006 as done") produce a draft with Confirm and Cancel, and nothing is saved until Confirm. Answers can be read aloud in a natural voice.

## How I built it

The skeleton is a Node and Express API on MongoDB with a React and Vite client. The skeleton's **Core** (resource engine, permissions, status flows, the generic screens) is *byte-identical* in all three apps, and a script (`npm run check:core`) proves it by hash. App-specific behaviour goes through documented extension points, never by editing Core.

The assistant is a small query engine. A question becomes a structured spec (resource, filters, date range, totals); the engine checks the asker's read permission, queries only declared fields and caps the result size. A rule-based parser handles most questions with no AI. Answers are read aloud with the best natural voice the device has.

**With Kiro:** [CONFIRM AND EDIT: the sentences below describe what is in the repository; only keep the ones that match what you did.]
- Three finished **specs** (`.kiro/specs`: requirements, design and a task list with property-based test targets) drive the skeleton and both apps; a fourth, `field-ready`, was written before the installable app, the tour and the assistant check were built.
- **Steering** files (`.kiro/steering`) keep conventions in front of the agent: three always on (product, tech, structure) and three that load for matching files (server, client and test conventions).
- **Agent hooks** (`.kiro/hooks`) run the related tests on save, check accessibility and theme tokens on UI edits, sync Core to the apps, and audit spec traceability.
- Later feature work was split across **parallel sub-agents** with a written brief that gave each one the files it owned and the API contracts it had to meet, then merged and verified.
- [YOUR EXPERIENCE: one or two sentences, e.g. what the spec-driven approach caught that vibe-coding would have missed, or which hook saved you time.]

## Challenges

- **Keeping three apps honest.** A change to a shared component had to land in all three without drifting. The byte-identity check and a sync script made that safe, and found real bugs (a service-worker cache name that would never have changed between deploys; a sort that put capital letters before lower case).
- **An assistant you can trust with real data.** The rule was that it can never see more than the person asking, and never changes anything on its own. That decided the design: structured queries instead of free text to the database, drafts instead of writes.
- **Testing what people actually do.** Beyond unit and property tests, real-Chrome suites sign in as every role, click through every feature, and audit every page in dark and light mode and at five screen widths from 320 to 1440 px. They caught contrast misses, 27 px of sideways scroll on small phones, and tap targets too small for a finger.

## Accomplishments I'm proud of

- Three apps that look and behave nothing alike, from one skeleton, all live.
- More than 1,600 automated tests (server, client, real-browser, installability), including property-based tests with `fast-check` and a model-based test of the checkout workflow.
- Accessibility measured, not assumed: WCAG AA text contrast on every page in both themes, and tap targets of at least 24 px.
- A chat assistant whose permission model is tested: a role that cannot read a resource is refused, and text inside records can never act as instructions.

## What I learned

Reuse only works if the shared part is *enforced*, not just agreed. Checking identity by hash, generating the app's name and icons from its own files, and testing the shared core against a frozen reference config turned "we should keep these in sync" into something that fails loudly.

## What's next

More apps from the same skeleton (a clinic roster, a classroom library), push notifications for installed apps.

## Built with

Kiro, JavaScript, React, Vite, Tailwind CSS, TanStack Query, Node.js, Express, MongoDB and Mongoose, MongoDB Atlas, Netlify, Render, Playwright, Jest, Vitest, fast-check, Brevo (email), PDFKit.

## Try it out (links)

- Crypt Kit: https://crypt-kit.netlify.app
- Lab Ledger: https://leb-ledger.netlify.app
- Pantry Ghost: https://pantry-ghost.netlify.app
- Source: https://github.com/suhailullakhan619/crypt-kit
- Video: [YOUR VIDEO LINK]
- Blog post: [YOUR BLOG LINK]
- Social post: [YOUR POST LINK]

---

## Testing instructions for judges (paste into the testing field)

No sign-up is needed. Each login page has one-click buttons for the demo roles. The three APIs run on free hosting and sleep after 15 minutes without traffic, so **the very first page can take up to a minute to wake; please wait for the role buttons to appear**, then everything is fast.

| App | Link | Roles (buttons on the login page) |
|---|---|---|
| Crypt Kit | https://crypt-kit.netlify.app | Admin, Member, Viewer |
| Lab Ledger | https://leb-ledger.netlify.app | LabManager, Technician, Student |
| Pantry Ghost | https://pantry-ghost.netlify.app | Coordinator, Volunteer, Board |

Two-minute tour:
1. **Lab Ledger**: press *Student*, open *Scan a label*, type `LL-0005`, press *Request checkout*. In a second tab press *Technician*, open `/scan/LL-0005` and press *Approve*.
2. Open the **Voice agent** page and type: `which items are overdue`, then `what is on my plate`. Click an answer's link.
3. **Crypt Kit**: press *Admin*, open the Voice agent and type `add a note to buy candles due friday high priority`. A draft appears; press *Confirm*.
4. Open any note: tick a subtask, add a comment, then switch the list to *Board* and *Calendar*. Press **Ctrl+K** to search everything.
5. **Pantry Ghost**: press *Coordinator*, open the Voice agent and type `add twelve cans of black beans expiring March 3rd from Fresh Mart`. A draft appears (cancel it, or confirm to add stock).
6. On a phone, use the browser's *Add to Home screen*: each app installs with its own icon and opens even offline.

The demo data is shared by all visitors, so you may see records other judges created. Demo accounts cannot change their password. Source code, specs, steering and hooks are in the repository under `.kiro/`.
