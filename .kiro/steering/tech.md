---
inclusion: always
---

# Tech Steering — Crypt Kit

## Stack (do not change without updating this file and the design spec)

**Server** (`*/server`)
- Node.js 20+, Express 4, **ES modules** (`"type": "module"`). Never use `require`.
- MongoDB through Mongoose 8. In `DEMO_MODE=true`, `mongodb-memory-server` starts an in-memory DB and seeds it.
- Auth: `jsonwebtoken` (24h expiry, claims `{ userId, role, name }`), `bcryptjs` with cost ≥ 10.
- Security: `helmet`, `cors` (origin from `CLIENT_URL`), `express.json({ limit: '1mb' })`.
- Jobs: `node-cron`.
- PDF: `pdfkit`.
- Voice: the browser's Web Speech API for listening and, by default, speaking. Optional Amazon Polly (`@aws-sdk/client-polly`) for spoken answers when `VOICE_PROVIDER=polly`; the server must run without AWS keys, and the client falls back to the browser voice if Polly fails.
- Tests: Jest 29 run with `--experimental-vm-modules`, `fast-check` for property-based tests, `supertest` for HTTP and `mongodb-memory-server` for integration.

**Client** (`*/client`)
- React 18, Vite 5, React Router 6.
- Tailwind CSS 3 with shadcn/ui components (Radix primitives) in `src/components/ui/`.
- Server state: `@tanstack/react-query` 5. Do not duplicate server data in React state.
- HTTP: `axios` via the `useApi()` hook only. Never call axios directly from components.
- Charts: `recharts`. Toasts: `react-hot-toast`. Icons: `lucide-react`.
- Tests: Vitest with React Testing Library.

## Rules

- Never use the deprecated callback style of Mongoose.
- Never log secrets, JWTs, passwords or audio contents.
- Errors thrown in services carry `err.status`. The global error handler **must** honour `err.status` (4xx–5xx). Unknown errors return 500 with `{ error: 'Internal server error' }` and no stack trace.
- Every endpoint except `/api/health`, `/api/meta/public` and `/api/auth/login` requires `authenticate`.
- Env vars are read only in `src/config/env.js`, which validates them at boot and exports a frozen object.
- The client never hard-codes resource fields. It renders them from `GET /api/meta`.
