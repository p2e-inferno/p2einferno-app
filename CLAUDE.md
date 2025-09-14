# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep changes minimal, aligned with existing patterns, and repo‑specific.

## Quick Commands
```bash
npm run dev                 # http://localhost:3000
npm run dev -- --turbo      # Turbopack (faster HMR)
npm run build && npm start  # Production build/run
npm run lint                # ESLint + Prettier check + tsc --noEmit
npm run test:coverage       # Jest + coverage (jsdom)
npm run db:migrate          # Apply Supabase migrations
```

## Project Structure
- Code: `components/` (UI), `pages/` (routes/API), `hooks/`, `lib/` (auth, supabase, utils), `constants/`, `styles/`, `public/`.
- DB: `supabase/` (migrations, functions). Use the Supabase CLI.
- Types: `lib/supabase/types*.ts` (generated + repairs), `lib/supabase/types.ts` (app types).

## Logging (standard)
- Use `getLogger(module)` from `lib/utils/logger` instead of `console.*`.
- Levels: `debug | info | warn | error`. Dev prints nicely; prod emits JSON.
- Env: `LOG_LEVEL` (server), `NEXT_PUBLIC_LOG_LEVEL` (client). Use `silent` to disable.
- Example (API route):
  ```ts
  import { getLogger } from '@/lib/utils/logger';
  const log = getLogger('api:milestone-tasks');
  log.error('db error', { milestoneId, err });
  ```
- Blockchain logger is bridged; existing `blockchainLogger` flows into the same transport.

## Auth & Admin Access
- Server auth helpers: `lib/auth/privy.ts` (`getPrivyUser` with JWT fallback), `lib/auth/admin-key-checker.ts` (parallel key checks), `lib/auth/error-handler.ts` (structured errors), `lib/auth/config-validation.ts`.
- **Admin Session Architecture**: Two-tier auth system for admin endpoints:
  - **Middleware** (`middleware.ts`): Enforces admin-session cookies on `/api/admin/*` routes (except session/logout). Enable via `ADMIN_SESSION_ENABLED=true`.
  - **Session Issuance** (`app/api/admin/session/route.ts`): Converts Privy JWT → short-lived admin session cookie with on-chain key verification.
  - **Client Integration** (`hooks/useAdminApi.ts`): Auto-refreshes session on 401, handles token/cookie flow transparently.
- Admin lock address: `NEXT_PUBLIC_ADMIN_LOCK_ADDRESS`. In dev, fallback uses `DEV_ADMIN_ADDRESSES`.
- Client auth hook: `lib/auth/hooks/useAuth.ts`.
- **Admin Security**: `hooks/useLockManagerAdminAuth.ts` implements wallet-session validation to prevent session hijacking. Connected wallet must belong to current Privy user; forces logout on mismatch. Tracks provider address via `eth_accounts` for immediate UI protection on wallet changes.

## Database (Supabase CLI)
- Preferred: Supabase CLI. If unsure, run `supabase --help`.
- Target selection: Use `NEXT_PUBLIC_SUPABASE_URL` to detect local vs remote.
- Secrets: DB password in `.env.local` (do not commit). Migrations live in `supabase/migrations/`.
- Common: `supabase start|stop`, `supabase db reset`, `supabase link --project-ref <ref>`, `supabase db push`, `supabase migration new <name>`.

## Coding & Tests
- TypeScript, 2‑space indent, React components in PascalCase, hooks as `useX.ts`, pages lowercase with dynamic segments.
- Tests: co‑located `*.test|spec.(ts|tsx)` using Jest + Testing Library. See `jest.config.ts` and `jest.setup.ts`.

## Blockchain & RPC Configuration
- **Unified Provider** (`lib/blockchain/provider.ts`): Single ethers read-only provider for frontend. Singleton pattern with client-side filtering of public Base endpoints when keyed RPCs (Alchemy/Infura) are available.
- **RPC URLs**: `getClientRpcUrls()` from `lib/blockchain/config/unified-config.ts` provides fallback list. Server includes public endpoints; client filters them when keyed providers exist.
- **Viem Integration**: `createPublicClientUnified()` for server/client with same filtering logic.
- **Dev Settings**: Set `ADMIN_RPC_WARMUP_DISABLED=1` to skip server RPC health checks in development.

## API Conventions
- Pages API under `pages/api/...`. Admin endpoints protected by middleware when `ADMIN_SESSION_ENABLED=true`.
- Use `lib/api.ts` axios instance for client requests; it already logs via the standard logger.
- **Admin API Flow**: Client calls → middleware checks cookie → auto-refresh on 401 → retry with valid session.
