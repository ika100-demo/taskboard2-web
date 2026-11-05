# ADR-001: Backend APIs are called server-side only

## Status

Accepted (2026-11-05, spec 001)

## Context

taskboard2-web is the only component exposed outside the environment; taskboard2-api is reachable only in-cluster
(`http://taskboard2-api`, system AC-002.12). The browser therefore cannot call the API, and the API's address must
not end up in the client bundle. Next.js offers three ways to reach a backend: from the browser (needs a public API
and CORS), through Route Handlers acting as a JSON proxy, or from Server Components and Server Actions.

## Decision

- The web app reaches backend APIs only from server code: reads in Server Components (`app/page.tsx`), writes in
  Server Actions (`app/actions.ts`), both through one typed client module per API under `app/_lib/` (here
  `app/_lib/tasks-api.ts`).
- API base URLs come from server-only environment variables (`TASKBOARD2_API_URL`), read at request time, never
  `NEXT_PUBLIC_*`.
- The client module never throws: it returns a result union, applies the timeout (`AbortSignal.timeout(5000)`, no
  retry), validates the response shape, and logs failed calls as one JSON line (method, path, status, duration,
  reason) without the response body.
- Server Actions return only the web app's own fixed texts and the validated objects, never API response bodies.
- Pages that read backend data are dynamic (`export const dynamic = "force-dynamic"`, `cache: "no-store"`).

## Consequences

- The browser only ever talks to the web app's own origin; no CORS, no public API exposure.
- No JSON proxy routes to maintain; a Server Action is the only write endpoint, and it is not a stable public API.
- A missing or unreachable backend degrades the page (error texts) instead of failing it, and probes stay
  independent of backends: `/api/ready` does not check the API.
- Tests mock `fetch` at the server boundary (Vitest) or run the app against a stub API (Playwright e2e).
