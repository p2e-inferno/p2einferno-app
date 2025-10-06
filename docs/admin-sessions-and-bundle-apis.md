# Admin Sessions, Route Handlers, and Bundle APIs

This document describes the new admin session model, consolidated Route Handlers, cache invalidation, and a safe, gradual migration path.

## Why Change
- Reduce repeated Privy + on-chain checks per request (latency + resilience).
- Consolidate multi-hop reads into single API calls (fewer round-trips).
- Adopt Next.js 15 Route Handlers + cache tagging for coherent, fast reads.
- Keep backward compatibility with existing Pages API endpoints.

## Key Components

- `POST /api/admin/session` (Route Handler)
  - Verifies Privy token + admin key once and issues short‑lived admin JWT.
  - Stores token in HttpOnly cookie (`admin-session`).
  - In-memory, per-minute rate limiter (`ADMIN_SESSION_RATE_LIMIT_PER_MINUTE`).

- Middleware `middleware.ts` (root)
  - Disabled by default; enable with `ADMIN_SESSION_ENABLED=true`.
  - Enforces admin session on `/api/admin/*` (excludes `/api/admin/session`).

- Bundle Read Route
  - `GET /api/admin/tasks/details?task_id=...&include=milestone,cohort,submissions[:status|:limit|:offset]`
  - Uses `unstable_cache` + `revalidateTag` tags: `admin:task:*`, `admin:milestone:*`, `admin:cohort:*`, `admin:submissions:*`.

- Mutation Routes (Route Handlers)
  - `app/api/admin/milestones/route.ts` (GET/POST/PUT/DELETE)
  - `app/api/admin/milestone-tasks/route.ts` (POST/PUT/DELETE; supports bulk create)
  - `app/api/admin/task-submissions/route.ts` (GET/POST/PUT)
  - All call `revalidateTag` to keep bundle reads fresh.

## Environment

Add to `.env.local`:

```
ADMIN_SESSION_TTL_SECONDS=60
ADMIN_SESSION_JWT_SECRET=replace-with-a-long-random-secret
ADMIN_SESSION_ENABLED=false   # true to enforce via middleware
ADMIN_SESSION_RATE_LIMIT_PER_MINUTE=30
ADMIN_RPC_TIMEOUT_MS=10000
ADMIN_MAX_PAGE_SIZE=200
```

## Client Integration

- Auto Session Refresh
  - `useAdminApi` now supports `autoSessionRefresh` (default on).
  - On `401`, it calls `POST /api/admin/session` with the Privy access token and retries once.

- Using the Bundle Endpoint
  - For Task Submissions page:
    - Replace 3 calls with `GET /api/admin/tasks/details?task_id=...&include=milestone,cohort,submissions[:status|:limit|:offset]`.
    - Keep `NetworkError` + `Retry` UX.

- Writes
  - Switch to Route Handlers for mutations to benefit from cache invalidation:
    - Milestones: `app/api/admin/milestones/route.ts`
    - Tasks: `app/api/admin/milestone-tasks/route.ts`
    - Submissions: `app/api/admin/task-submissions/route.ts`

## Gradual Migration Plan

1) Pre‑reqs
   - Ensure `ADMIN_SESSION_JWT_SECRET` is set.
   - Leave `ADMIN_SESSION_ENABLED=false` while integrating.

2) Enable in Dev
   - Set `ADMIN_SESSION_ENABLED=true` locally; confirm session issuance and retry flow.

3) Migrate Reads (High ROI)
   - Task Submissions page → `tasks/details` (done).
   - Consider `quests/details` and `cohorts/details` later if they chain calls.

4) Migrate Writes
   - Update admin pages to call new Route Handlers for milestones, milestone-tasks, task-submissions.
   - Confirm UI updates immediately (tags revalidated).

5) Rollout
   - Enable middleware in staging; then production.
   - Keep Pages API endpoints for a deprecation window.

## Caching & Invalidation

- Reads use `unstable_cache` keyed by entity; tags:
  - `admin:task:<id>`, `admin:milestone:<id>`, `admin:cohort:<id>`, `admin:submissions:<taskId>`.
- Mutations call `revalidateTag` to refresh caches used by `tasks/details`.

## Testing & Mocking

- Privy + JWT
  - For unit tests, we mock `jose` and `@privy-io/server-auth` in `jest.setup.ts`.
  - See Privy’s guide for mocking tokens: https://docs.privy.io/recipes/mock-jwt#mocking-tokens-for-testing

- Web3
  - We avoid real chain calls in unit tests. For more realistic web3 tests, consider `@depay/web3-mock`:
    - https://www.npmjs.com/package/@depay/web3-mock
    - Use to simulate providers and on-chain reads in integration tests.

- Next.js Objects
  - For Route Handlers, we mock `next/server`’s `NextResponse` in tests to avoid importing Next’s Request implementation.

## Rollback & Safety

- Keep Pages API routes operational until all clients migrate.
- Middleware remains gated by `ADMIN_SESSION_ENABLED`.
- Rate limiting on session issuance guards against abuse.

## FAQ

- Q: Why not revalidate Pages API?  
  A: `revalidateTag` is a Next 15 Route Handler feature. We migrate writes to app/api to leverage it.

- Q: Will this break auth?  
  A: No. The session is additive. With middleware disabled, existing flows are unaffected.

