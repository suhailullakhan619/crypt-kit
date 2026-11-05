---
inclusion: always
---

# Product Steering — Crypt Kit

## What we are building

Crypt Kit is a **Skeleton Crew** entry for Kiroween 2026. It has two parts:

1. **The skeleton** (`/skeleton`) is a lean full-stack template. Developers declare domain *resources*, and the skeleton supplies auth with roles, CRUD API and UI, a dashboard, PDF reports, scheduled due-date jobs, an activity log, and a voice agent.
2. **Two apps raised from it** prove its versatility:
   - **Lab Ledger** (`/lab-ledger`) tracks equipment in university teaching labs. Its items are unique, each with a serial number. It covers checkout/return and calibration.
   - **Pantry Ghost** (`/pantry-ghost`) runs inventory for community food banks. Its items are quantity-based with expiry dates. It covers donation intake by voice, first-expiry-first-out (FEFO) distribution and impact reports.

## Who it is for

- **Skeleton:** small teams and student developers who need an internal tool in days, not weeks.
- **Lab Ledger:** lab managers, technicians and students. Their pain points are lost equipment, missed calibrations and paper sign-out sheets.
- **Pantry Ghost:** food bank coordinators and volunteers. Their pain points are food expiring on shelves, slow intake when volunteers' hands are full, and grant reports assembled by hand.

## Judging priorities (keep these in mind for every decision)

1. **Potential impact.** Every feature must serve a real user in the stories above. Cut features that don't.
2. **Technological implementation.** Use Kiro deeply: specs, steering, hooks, MCP and property-based tests. Record how in `docs/KIRO_USAGE.md`.
3. **Design.** Deliver a complete, polished product, not a proof of concept. The UI uses a tasteful Halloween theme without hurting usability.
4. **Innovation.** Config-driven resources plus a voice agent plus generated PDFs in one lean skeleton.
5. **Presentation.** Every feature must be demoable in under 3 minutes.

## Non-goals

- No multi-tenant SaaS, billing or SSO.
- No mobile native apps. The responsive web app goes down to 375px wide.
- Do not use third-party trademarks or copyrighted assets in the UI or the demo.

## Tone

UI copy is friendly and lightly spooky ("Summoning records…", "Nothing lurking here yet"). Error messages stay plain and actionable. Never let a pun hide the meaning.
