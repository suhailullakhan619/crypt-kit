# Demo video script (3:00)

**One sentence the video must land:** *Describe your records once, and a skeleton gives you the whole app: three working apps raised from it, live, with a chat assistant that answers from your data and never changes anything without a confirm.*

Judges score **Presentation** on: does the video show the project working end to end, does it say what problem is solved, for whom, and why it matters, is it easy to follow. The **Best Demo** bonus ($1,000) is judged on the same thing. So: real screens, real clicks, no slides except the first and last seconds.

## Before you record (10 minutes)

- [ ] **Wake the APIs.** Open the three login pages one minute before. The free Render APIs sleep after 15 minutes idle, and a one-minute spinner on camera costs you the first impression.
- [ ] Browser: a clean profile, no bookmarks bar, 1920×1080 screen or window at 1440×900, zoom 110%, dark theme (it films best). Close notifications and chat apps.
- [ ] Open these tabs in this order: Lab Ledger (signed out), Lab Ledger (second tab, to sign in as Technician), Crypt Kit (signed out), Pantry Ghost (signed out), the GitHub repo.
- [ ] Phone ready with a Lab Ledger label on screen (or print one) for the QR moment; or use the screen-sharing option below.
- [ ] Recording: OBS or the built-in Windows recorder (Win+Alt+R), 1080p, microphone at normal speaking volume. Record in 2 or 3 takes by segment; cut together.
- [ ] Do a dry run of segments 2 and 3 once so the data on screen is in its starting state (reload resets nothing on the live demo; use fresh item IDs, see the notes at the end).

## Timeline

| Time | Segment | On screen | Say (read it naturally, do not recite) |
|---|---|---|---|
| 0:00–0:15 | **The problem** | Title card with the three app names, then a quick cut to the Lab Ledger dashboard | "Teaching labs lose track of who has the oscilloscope. Food banks throw away what expired on the shelf. Every small team needs the same ten things, and then a little that is theirs. This is Crypt Kit." |
| 0:15–0:45 | **The idea** | The repo: `skeleton/server/src/resources/notes.js` (a resource definition), then the README architecture diagram | "You describe your records once, as a resource definition: fields, roles, a status flow, a due rule. The server enforces it, the screens render from it, search, CSV, the API docs and the chat assistant all read it. Lab Ledger and Pantry Ghost were raised from the same skeleton, and their shared core is byte-identical. One command proves it." (show `npm run check:core` output: *Core identical … 47 files*) |
| 0:45–1:30 | **Lab Ledger, end to end** | Student → `Scan a label` → type `LL-0005` → *Request checkout*. Switch tab: Technician → `/scan/LL-0005` → *Approve*. Phone: scan the QR label, the item opens. | "A student scans the QR label on the equipment and requests a checkout. The technician approves it; two people can never both win the same item, even at the same moment. The QR link works from any phone camera and asks you to sign in first." |
| 1:30–2:05 | **The assistant** | Voice agent: ask *"which items are overdue"*, then *"what is on my plate"*, then (Crypt Kit) *"add a note to buy candles due friday high priority"* and press **Confirm** | "Ask in plain words and it answers from your own data, with links to the records. It only ever reads, and only what you are allowed to see. When you ask it to do something, like add a note, it shows a draft first. Nothing is saved until you press Confirm." |
| 2:05–2:25 | **Crypt Kit as a to-do suite** | Open a note: tick a subtask, add a comment. Switch the list to **Board**, drag a card. Press Ctrl+K and search. | "The skeleton itself is a to-do suite: projects, reminders, goals and a time log. Subtasks, comments, a board and a calendar, and search across everything." |
| 2:25–2:40 | **Pantry Ghost** | Dashboard *Use first* board; Voice agent: *"add twelve cans of black beans expiring March 3rd from Fresh Mart"* → draft card | "Pantry Ghost is a different app on the same bones: say a donation, and it drafts the stock entry. It picks what expires first." |
| 2:40–3:00 | **How it was built, and the close** | Split: the `.kiro` folder (specs, steering, hooks), then the test numbers, then the three live links | "Built in Kiro with specs, steering and hooks. Over [N] automated tests, [M] browser steps on every app, and a dark and light audit of every page. Three live apps, installable on a phone, free to try. Links are in the description." |

Fill `[N]` and `[M]` from the numbers in the README's *Tests* table the day you record (server tests added up, browser steps added up).

## Shot list: exact clicks

1. **Lab Ledger, Student.** `https://leb-ledger.netlify.app` → button **Student** → sidebar **Scan a label** → type `LL-0005` → **Find** (or Enter) → **Request checkout** → pick a due date within 30 days → submit.
2. **Lab Ledger, Technician (second tab).** Button **Technician** → `…/scan/LL-0005` → **Approve**. Show the status change and the history entry.
3. **QR on a phone.** Open `…/r/equipment/<id>` for `LL-0005` on the laptop, show the QR card, scan it with the phone: it opens the item. (Screen-record the phone separately, or film the phone over the shoulder.)
4. **Assistant.** Sidebar **Voice agent**. Type each question, press the send arrow. Let the answer sit for two seconds so the links can be read.
5. **Crypt Kit.** `https://crypt-kit.netlify.app` → **Admin** → **Voice agent** → type the add-a-note sentence → **Confirm** → **Open it**. Then **Notes** → open *Label the potion shelf* → tick *Stick the labels on* → add a comment → back to **Notes** → **Board** → drag a card to *Done* → Ctrl+K → `pot`.
6. **Pantry Ghost.** **Coordinator** → dashboard → **Voice agent** → the intake sentence → show the draft card (do not confirm, or the demo stock changes).
7. **Repo.** `.kiro/specs`, `.kiro/steering`, `.kiro/hooks`; terminal: `npm run check:core`.

## Things to avoid on camera

- Do not show `.env` files, the Render or Netlify dashboards with keys visible, or the Brevo password.
- The demo data is **shared by everyone**. Use item IDs nobody else is likely to be using, and do not leave the demo in a odd state (cancel or return what you requested after filming).
- Emails from the demo go to spam and to nobody useful; do not demo email.
- Skip anything that needs a microphone unless you rehearse it: the typed chat is reliable, speech depends on the browser and the room.
- Keep it under 3 minutes. Devpost judges are told they do not have to watch past it.

## If you also want a 20-second version (social, thumbnails)

Open the Lab Ledger chat → *"which items are overdue"* → click an answer link → the item with its QR code → cut. Caption: *"Ask. Get the answer, and the record."*

## Your own words

The script above is a skeleton too. Change any sentence you would not say. The only claims that must stay exactly true are the ones about what the product does (all of them are covered by the browser tests listed in the README) and about how it was built (see `docs/KIRO_USAGE.md`).
