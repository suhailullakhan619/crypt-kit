# Submission checklist: what only you can do

Deadline: **Dec 4, 2026, 2:00 PM PT**. Aim to submit a day early; Devpost lets you save drafts and edit until the deadline.

Everything in the repository is done and tested. These items need you, because they involve your accounts, your voice, or claims about your own work.

## 1. Before anything else (30 minutes)

- [ ] **Read `docs/KIRO_USAGE.md` and make every sentence true.** The `TODO(owner)` comments in it mark the spots only you can fill: which Kiro features you used and what they did for you. Delete anything you did not use. Stage 1 of judging is a pass/fail check that the project "reasonably applies the required tools", so this file matters more than any feature.
- [ ] Decide the **Kiro Crew** bonus: only if you actually built a separate Crew app and have its repo. Otherwise ignore it.
- [ ] `.kiro/settings/mcp.json` points the MongoDB MCP server at `mongodb://localhost:27017/crypt-kit`, which does not exist on a machine without a local MongoDB. Either start one, change it, or remove that entry, so a judge who opens the config is not misled.

## 2. Turn on Amazon Polly voices (optional, 15 minutes)

Follow `docs/POLLY.md`. Do it locally first with `npm run voice:test --prefix skeleton/server`; when it prints "Polly answered", add `VOICE_PROVIDER=polly`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` on the three Render services and check `/api/health` says `"voiceProvider": "polly"`. Never paste the keys into chat or commit them.

## 3. Record the demo video (about 90 minutes)

`docs/DEMO_SCRIPT.md` has the timeline, narration and exact clicks. Upload to YouTube (or Vimeo) as **public or unlisted**, under 3 minutes, in English. This also enters you for **Best Demo** ($1,000).

## 4. Publish the bonus posts (30 minutes)

- [ ] **Blog post** (`docs/BLOG_POST.md`): publish on dev.to, Medium or Hashnode. It must be public and mention the Kiroween Hackathon 2026. 100 winners get 2,000 Kiro credits, so this is the best-odds prize available. Add your own paragraph about what building in Kiro was like.
- [ ] **Social post** (`docs/SOCIAL_POSTS.md`): public, with the hashtag `#KiroweenHackathon26`. 5 winners.

## 5. Fill in the Devpost form

Use `docs/DEVPOST.md`, section by section. Category: **Skeleton Crew**. Add the three live links, the repository link, the video, and the testing instructions block (it has the demo logins).

Things Devpost will ask that are easy to forget:
- The repository must be **public**, have an **open-source license** (it has MIT) and keep the **`.kiro` folder** committed (it is; do not add it to `.gitignore`).
- Give judges the demo logins in the **testing instructions** field.
- Add the blog and social links in the fields for them.

## 6. The day before

- [ ] Open all three live sites in a private window, sign in with each demo button, and ask the chat one question. (The APIs sleep; the first request can take a minute.)
- [ ] `npm run live --prefix e2e` for a 7-minute read-only check of the live sites.
- [ ] Confirm the video plays when logged out of YouTube.
- [ ] Re-read the Devpost text once for anything that is no longer true (counts, links).
- [ ] Submit. Then check the project page shows "Submitted", not "Draft".
