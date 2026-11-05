---
inclusion: fileMatch
fileMatchPattern: "**/client/src/**/*.{js,jsx}"
---

# Client Conventions

- Fetch data with React Query only: `useQuery({ queryKey: ['r', key, params], queryFn })`. After a mutation, invalidate `['r', key]` and `['dashboard']`.
- Get the axios instance from `useApi()`. API functions in `src/api/` take it as their first argument: `listRecords(api, key, params)`.
- Permissions: use `usePermission()`, which wraps `lib/can.js`, a mirror of `server/src/core/permissions.js`. **Hide** controls the user cannot use. Do not just disable them.
- Each mutation shows a toast: `toast.success('Record summoned')` on success and `toast.error(message from server)` on error.
- Loading states use `<Skeleton />` placeholders, never spinners on whole pages. The voice agent is the one exception: it may show a pulsing "listening" or "thinking" orb.
- Accessibility: every icon-only button has an `aria-label`, forms use `<Label htmlFor>`, focus rings stay visible, and the spooky theme keeps text contrast ≥ 4.5:1.
- Responsive from 375px to 1920px. The sidebar collapses to a sheet below the `md` breakpoint.
- Never hard-code a resource's fields. Render them from `useMeta().resources[key].fields`.
