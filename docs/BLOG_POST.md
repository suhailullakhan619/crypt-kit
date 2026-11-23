---
title: "One skeleton, three apps: what I learned building Crypt Kit for the Kiroween Hackathon 2026"
published: false
tags: kiro, hackathon, node, react
cover_image: https://raw.githubusercontent.com/suhailullakhan619/crypt-kit/main/docs/screenshots/lab-detail.png
---

> I built this for the **Kiroween Hackathon 2026** (Skeleton Crew category). Source: https://github.com/suhailullakhan619/crypt-kit · Live: https://crypt-kit.netlify.app · https://leb-ledger.netlify.app · https://pantry-ghost.netlify.app
>
> Before publishing: add your own paragraph under "How Kiro fit in", and set `published: true`.

A teaching lab cannot tell who has the oscilloscope. A food bank throws away what expired on the shelf. Both are tracked in spreadsheets, and both need the same ten things before they need anything of their own: sign-in, roles, lists, forms, history, notifications, reports, search, a phone layout. Nobody builds those ten properly for a small tool, so the tool stays a spreadsheet.

So I built the ten things once. **Crypt Kit** is a skeleton: you describe a kind of record in one file, and you get the API, the screens, the permissions, the PDFs, the QR labels and a chat assistant. To prove it is a skeleton and not a demo, I raised two very different apps from it, and a third (the skeleton itself, as a to-do suite).

## The one idea: a resource definition is the source of truth

```js
export default defineResource({
  key: 'notes',
  fields: {
    title:   { type: 'string', required: true, list: true, search: true },
    status:  { type: 'enum', values: ['Open', 'Done', 'Overdue', 'Archived'], filter: true },
    dueDate: { type: 'date', list: true },
    subtasks:{ type: 'checklist' },
  },
  permissions: { read: ['Member', 'Viewer'], create: ['Member'], update: ['Member'], delete: [] },
  statusFlow: { field: 'status', transitions: { Open: ['Done', 'Archived'] /* … */ } },
  due: { field: 'dueDate', status: 'status', from: ['Open'], to: 'Overdue' },
});
```

The server enforces that file. The client renders lists, forms, a board and a calendar from it. Search, CSV import, the OpenAPI page and the chat assistant read it too. A new app is new definitions, not new plumbing.

The part I am proudest of is boring: the skeleton's core is **byte-identical** in all three apps, and `npm run check:core` proves it by hash. Reuse only works if the shared part is enforced rather than agreed. It already paid off: when I changed a shared component, the check refused to let one app drift.

## A chat assistant you can trust with real data

The rule was simple: it can never see more than the person asking, and it never changes anything by itself.

- A question becomes a **structured query** (resource, filters, date range, totals), not free text sent near a database. A rule-based parser handles most questions with no AI at all: "which notes are over due", "total minutes I logged this week", "tell me about N-0006".
- The query engine checks the asker's read permission, touches only declared fields, caps the result size, and escapes everything it searches for.
- **Commands are drafts.** "Add a note to buy candles due friday" produces a card with Confirm and Cancel. Nothing is saved until Confirm, and the save goes through the normal API, so validation and permissions are identical to the forms.
- An optional Amazon Bedrock model can answer free-form questions, but only by calling three read-only tools that go through that same engine. Text inside records is data, never instructions.

"Today", "tomorrow at 5pm" and "this week" mean the *asker's* day, not the server's. The client sends its timezone offset, and a test asks for a reminder from an Indian timezone and checks the stored instant.

## What testing found

I tested a lot, and the interesting results were small things that would have shipped:

- **A service worker that never updated.** The build stamps a hash into the worker's cache name so each deploy gets a fresh cache. The placeholder appeared twice in the file, once in a comment, and I replaced only the first. A unit test that loads the worker and counts the placeholders caught it before any user had a stale cache.
- **Sorting a column put "Zebra" before "apple".** MongoDB sorts by byte value unless you give it a collation. Now text columns sort the way people expect, and a test checks capital letters, plurals and numbers in names.
- **A confirm card that remembered the last answer.** After one command, the next command showed the old "Done" instead of a new Confirm button. A React key per answer fixed it, and a test now sends two commands in a row.
- **27 px of sideways scroll on a small phone.** The top bar did not fit 320 px. An audit that opens every page at five widths found it on all three apps within minutes. It also found many tap targets smaller than the 24 px minimum for a finger.
- **Colour that read fine to me and failed WCAG.** An audit measuring contrast on every page, in dark and light, found badges at 3.5 to 4.4:1. They are now above 4.5:1 everywhere.

The suites are: server tests with property-based checks (`fast-check`), client tests, real-Chrome end-to-end runs that sign in as every role, an installability check on the production build, and the dark and light and five-widths audits. More than 1,600 automated tests in all.

## Installable, and honest offline

Each portal is a PWA with its own icon, generated from its own logo and name. The service worker caches only the app shell. It never touches the API, so records and tokens are never stored or shown stale, and a deploy replaces the cache. Offline, the app opens and says it is offline instead of showing a browser error.

## How Kiro fit in

*[Write this paragraph yourself. Three honest sentences are worth more than a long one: what you used (specs, steering, hooks, sub-agents, MCP), one thing it caught or sped up, and one thing that did not work as you hoped.]*

What is in the repository, so you can look: three specs with requirements, design and tasks (`.kiro/specs`), six steering files, six agent hooks, and a fourth spec (`field-ready`) written before the installable app, the tour and the assistant check were built.

## Try it

No sign-up: each login page has one-click demo buttons. The free APIs sleep, so the first load can take a minute.

- Crypt Kit: https://crypt-kit.netlify.app
- Lab Ledger: https://leb-ledger.netlify.app (press *Student*, scan `LL-0005`)
- Pantry Ghost: https://pantry-ghost.netlify.app

Raise your own with `npm run summon -- my-app`. The code is MIT licensed.

*#KiroweenHackathon26*
