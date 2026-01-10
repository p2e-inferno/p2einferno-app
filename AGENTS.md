# Repository Guidelines

## Project Structure & Module Organization

- Source: `components/` (UI), `pages/` (Next.js routes & API), `hooks/` (React hooks), `lib/` (auth, supabase, utils), `constants/`, `styles/`, `public/` (assets).
- Backend/DB: `supabase/` (migrations, edge functions), config in `supabase/config.toml`.
- Docs: `docs/` (auth, CSP, payment guides). Config: `next.config.js`, `tailwind.config.js`, `jest.config.ts`.

## Build, Test, and Development Commands

- `npm run dev`: Start local Next.js dev server on `http://localhost:3000`.
- `npm run dev -- --turbo`: Start dev server with Turbopack for faster HMR.
- `npm run build`: Production build.
- `npm start`: Run production server (after build).
- `npm test | test:watch | test:coverage`: Run Jest tests, watch mode, or with coverage.
- `npm run lint`: ESLint + Prettier check + TypeScript `--noEmit`.
- `npm run format`: Format with Prettier.
- `npm run db:migrate`: Apply Supabase migrations.

## Database Interaction (Supabase CLI)

- Preferred tool: Use the Supabase CLI for all database tasks unless the user specifies otherwise. Use `supabase --help` to discover commands.
- Target selection: Read `NEXT_PUBLIC_SUPABASE_URL` to determine local vs remote; local typically includes `localhost`/`127.0.0.1`, remote ends with `.supabase.co`.
- Credentials: The database password is in `.env.local`. Load env before running commands; never commit secrets.
- Common workflows:
  - Local: `supabase start` (start stack), `supabase stop` (stop), `supabase db reset` (recreate local DB and apply `supabase/migrations/`).
  - Remote: `supabase link --project-ref <ref>` then `supabase db push` to apply migrations; create new files with `supabase migration new <name>`.
  - Edge functions: `supabase functions deploy verify-blockchain-payment` when updating `supabase/functions/verify-blockchain-payment`.
- Repo script: `npm run db:migrate` exists but CLI is preferred for day-to-day work.

## Coding Style & Naming Conventions

- TypeScript-first; 2-space indent; avoid `any`.
- React components: PascalCase files in `components/` (e.g., `WalletDetailsModal.tsx`).
- Hooks: `useX.ts` in `hooks/` (e.g., `useBootcamps.ts`).
- Pages: kebab/lowercase and dynamic segments in `pages/` (e.g., `pages/bootcamp/[id].tsx`).
- Utilities: camelCase in `lib/`.
- Tools: ESLint (`next lint`), Prettier (`format`), TailwindCSS in `styles/globals.css`.

## Testing Guidelines

- Framework: Jest + Testing Library (jsdom). Config in `jest.config.ts` and `jest.setup.ts`.
- Location: tests are centralized under `__tests__/` (unit/integration) mirroring source folders. Prefer this over scattering test folders across the tree.
- Filenames: `*.test.ts(x)` or `*.spec.ts(x)`.
- Coverage: collected from UI, lib, hooks; use `npm run test:coverage` for reports.
- Mocks: see router/Privy/crypto mocks in `jest.setup.ts`.

### E2E Testing (Synpress + Playwright)

- Tool: Synpress v4 with Playwright for Web3/MetaMask wallet testing.
- Config: `playwright.config.ts`, wallet setup in `tests/wallet-setup/`, specs in `tests/e2e/`.
- Commands:
  ```bash
  npx synpress ./tests/wallet-setup  # Build wallet cache (one-time)
  npm run test:e2e                   # Run E2E tests
  ```
- Known issue: Cache hash mismatch between CLI and runtime (Synpress #1103). Workaround: rename `.cache-synpress/[cli-hash]` to expected hash shown in error.
- Dev server: `reuseExistingServer: !process.env.CI` means Playwright reuses running `npm run dev` locally.
- Full guide: `docs/E2E_TESTING.md`.

## Admin Sessions & Bundle APIs

- Admin session: short‑lived JWT stored in an HttpOnly cookie (`admin-session`).
  - Issue: `POST /api/admin/session` after Privy login; server verifies Privy and admin key once, then sets cookie.
  - Verify: Optional middleware (disabled by default) enforces session on `/api/admin/*`. Enable with `ADMIN_SESSION_ENABLED=true`.
  - Middleware behavior (cookie‑only): When enabled, middleware accepts only the `admin-session` cookie for `/api/admin/*` and ignores `Authorization` headers. It bypasses `/api/admin/session`, `/api/admin/session-fallback`, and `/api/admin/logout` so the client can mint/rotate/clear the cookie.
  - TTL: `ADMIN_SESSION_TTL_SECONDS` (single source). Secret: `ADMIN_SESSION_JWT_SECRET`.
- Consolidated endpoints: prefer Route Handlers under `app/api/` that return bundled data to cut round‑trips.
  - Implemented: `GET /api/admin/tasks/details?task_id=...&include=milestone,cohort,submissions[:status|:limit|:offset]`.
  - Keep Pages API versions for compatibility where they still exist; avoid introducing any `pages/api/v2/*`. Remove legacy v2 pages when found and point callers to the canonical App Route or existing Pages API route.

### Route Handlers: Admin Enforcement (Required)

- All App Route Handlers under `app/api/admin/*` MUST enforce admin auth using `ensureAdminOrRespond` from `lib/auth/route-handlers/admin-guard`.
- Pattern to apply at the top of each handler (`GET|POST|PUT|DELETE`):
  - `const guard = await ensureAdminOrRespond(req);`
  - `if (guard) return guard;`
- Behavior mirrors Pages API `withAdminAuth`:
  - Accept valid short‑lived `admin-session` JWT (cookie fast‑path)
  - Else verify Privy token and check on‑chain admin lock for any user wallet (reads) or for the `X-Active-Wallet` (writes)
  - Dev fallback when `NEXT_PUBLIC_ADMIN_LOCK_ADDRESS` is unset (configurable)

### Milestone Tasks: Read vs Mutations

- Mutations only: `app/api/admin/milestone-tasks/route.ts` (POST/PUT/DELETE). No GET.
- Reads use the dedicated endpoint: `GET /api/admin/tasks/by-milestone?milestone_id=...` (or `?id=...`).
- Update any callers to use the read endpoint (e.g., `TaskList`, `MilestoneFormEnhanced`).

### New Route Handlers (Mutations + Invalidation)

- `app/api/admin/milestones/route.ts` (GET/POST/PUT/DELETE)
- `app/api/admin/milestone-tasks/route.ts` (POST/PUT/DELETE; supports bulk create)
- `app/api/admin/task-submissions/route.ts` (GET/POST/PUT)
- All call `revalidateTag` for cache-coherent reads with the bundle route.

### Migration Checklist (Client)

1. Enable dev middleware: set `ADMIN_SESSION_ENABLED=true` locally.
2. Adopt `useAdminApi` with `autoSessionRefresh` (default on) for 401 → session → retry.
3. Read endpoints: switch to `tasks/details` where multiple fetches are chained.
4. Write endpoints: switch to Route Handlers listed above to benefit from tag invalidation.
5. Keep old Pages API calls as fallback until stabilized; remove later.

### Client Fetch Lifecycle (Admin)

- Use `hooks/useAdminFetchOnce` to run data fetches once per `[auth + wallet + keys]` composite key.
  - Auth‑aware: waits for `authenticated && isAdmin`
  - Wallet‑aware: resets when active wallet changes
  - Key‑aware: resets when entity IDs change
  - TTL: `timeToLive` re‑runs fetcher (default 5 minutes) with optional `throttleMs`
- Continue using `useAdminApi` with `autoSessionRefresh` enabled for seamless 401 → `POST /api/admin/session` (with `Authorization: Bearer <Privy>` + `X-Active-Wallet`) → retry.
- Option: pass `verifyTokenBeforeRequest: true` to `useAdminApi` to ensure a fresh Privy token before issuing requests.

See `docs/admin-sessions-and-bundle-apis.md` for full guidance.

## Blockchain Clients (Frontend)

- Unified ethers read‑only provider: `lib/blockchain/provider.ts#getReadOnlyProvider()` is the single source for browser read calls. It filters public Base RPC (`*.base.org`) when a keyed RPC (Alchemy/Infura) is configured to avoid 403s/noise, and builds an `ethers.FallbackProvider` when multiple URLs exist.
- Wallet provider (signing): use `getBrowserProvider()` or existing helpers that construct `ethers.BrowserProvider` from `window.ethereum` when user interaction/signing is required.
- Viem PublicClient: `createPublicClientUnified()` is available for reads; on the client it also filters public Base RPC when keyed endpoints exist.
- Balance polling gating: `hooks/useWalletBalances` accepts `{ enabled, pollIntervalMs }` and should be enabled only when the wallet menu/modal is open.

## Middleware Behavior (Admin)

- When `ADMIN_SESSION_ENABLED=true`:
  - `/api/admin/*` requires a valid `admin-session` cookie; `Authorization` headers are ignored by middleware.
  - The following paths are exempted: `/api/admin/session`, `/api/admin/session-fallback`, `/api/admin/logout`.
  - Route handlers still perform wallet/key checks via `ensureAdminOrRespond`.

## Retryable Error UX

- Use `components/ui/network-error` for fetch/DB failures with a Try Again button.
- Wire a local `handleRetry` and set `isRetrying` while refetching.
- When calling `useAdminApi`, pass `{ suppressToasts: true }` if rendering `NetworkError` to avoid duplicate toasts.

## EAS Schema Manager (Admin)

- **Admin UI**: `/admin/eas-schemas` with tabs for list, deploy, sync, config; network selector uses `eas_networks` (enabled only).
- **Admin APIs (App Routes)**:
  - `GET /api/admin/eas-networks` (enabled networks)
  - `GET /api/admin/eas-schemas?network=...`
  - `POST /api/admin/eas-schemas` (deploy + save)
  - `GET /api/admin/eas-schemas/[uid]?network=...`
  - `PATCH /api/admin/eas-schemas/[uid]?network=...` (metadata only)
  - `POST /api/admin/eas-schemas/sync`
  - `POST /api/admin/eas-schemas/reconcile`
  - `POST /api/admin/eas-schemas/[uid]/redeploy` (deploy missing schema + update UID)
- **Auth**:
  - Schema mutations require admin session + `X-Active-Wallet` + signed admin action (EIP-712).
  - EAS Config tab mutations are DB-only (no on-chain activity); require admin session + `X-Active-Wallet` but **do not** require signed actions.
- **Network config**: `public.eas_networks` (migrations `118`, `121`) is DB‑backed with fallback in `lib/attestation/core/network-config.ts`. Only enabled networks appear in UI/API.
- **Schema IDs**: `schema_uid` may be non‑bytes32 placeholders; UI flags invalid UIDs as "Not on-chain" without RPC calls.
- **EAS Scan**: Only show when UID is valid; use `eas_scan_base_url` from `eas_networks`.
- **Network updates**: Admin config changes invalidate `eas_networks` cache so the dropdown updates immediately.

### EAS Migration Verification (Ops)

- Confirm existing `attestation_schemas.network` values were backfilled correctly.
- Confirm `attestations.network` is populated and matches schema network.
- Validate composite FK `(schema_uid, network)` after backfill; only then drop the legacy FK if still present.

## New Environment Variables

- `ADMIN_SESSION_TTL_SECONDS` — admin session expiry in seconds (default 60).
- `ADMIN_RPC_TIMEOUT_MS` — RPC timeout for on‑chain admin checks (default 10000).
- `ADMIN_MAX_PAGE_SIZE` — upper bound for list endpoints (default 200).
- `ADMIN_SESSION_ENABLED` — enable middleware enforcement on `/api/admin/*` (default false).
- `ADMIN_SESSION_JWT_SECRET` — HS256 secret for admin session signing. Set a strong random value in prod.
- `ADMIN_RPC_FALLBACK_STALL_MS` — viem/ethers fallback ranking stall window (ms) for RPC client.
- `ADMIN_RPC_FALLBACK_RETRY_COUNT` — fallback retry count for RPC client.
- `ADMIN_RPC_FALLBACK_RETRY_DELAY_MS` — fallback retry delay (ms).
- `ADMIN_RPC_WARMUP_DISABLED` — set to `1` to disable server RPC warm‑up in development.

## Migration Notes

- Existing Pages API endpoints remain unchanged; new Route Handlers are additive.
- Prefer bundle endpoints for new work; migrate heavy admin pages opportunistically.
- When enabling middleware, ensure your admin UI calls `POST /api/admin/session` after login and retries on 401.

## Logging

- Use `getLogger(module)` from `lib/utils/logger`. Levels: `debug|info|warn|error|silent`.
- Output format: pretty text in dev; structured JSON in prod.
- Transport: avoids `console.*` (uses stdout/stderr on server; safe buffer in browser). Next.js `removeConsole` does not affect logger output.
- Defaults: dev defaults to `debug`; prod defaults to `silent` unless overridden by env.
- Env vars: `LOG_LEVEL` (server) and `NEXT_PUBLIC_LOG_LEVEL` (client). Recommended: leave client unset in prod.
- Example (API route): `const log = getLogger('api:milestone-tasks'); log.error('db error', { milestoneId, err });`
- Blockchain: `blockchainLogger` uses the same transport; prefer helpers in `lib/blockchain/shared/logging-utils`.
- See `docs/logging.md` for full guidance and best practices.

## Commit & Pull Request Guidelines

- Commits: Prefer Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Keep messages imperative and scoped (e.g., `feat(wallet): add chain selector`).
- PRs: Clear description, rationale, and screenshots for UI. Link issues, list breaking changes, include test notes and manual steps. Keep PRs focused and small.

## Security & Configuration Tips

- Never commit secrets. Use `.env.local` for `NEXT_PUBLIC_*`, Supabase, Privy, Paystack, RPC keys (see `README.md`).
- Validate config on startup (`lib/auth/config-validation.ts`).
- Review CSP and auth docs in `docs/` before changing security-sensitive code.
- Database changes must include Supabase migrations in `supabase/migrations/` and be applied with `db:migrate`.

## Admin Security Architecture

- **Wallet-Session Validation**: `hooks/useLockManagerAdminAuth.ts` implements defense against session hijacking attacks.
  - Tracks connected wallet via provider `eth_accounts` calls (similar to `PrivyConnectButton` pattern)
  - Validates connected wallet belongs to current Privy user's linked accounts
  - Forces immediate logout (both admin session and Privy) when wallet doesn't match user
  - Only checks admin access for validated connected wallet (prevents privilege escalation via stale sessions)
  - Provides immediate UI protection on wallet changes with loading states
- **Security Principle**: Connected wallet must own the session; changing wallets invalidates authentication state to prevent unauthorized access through persistent sessions.
