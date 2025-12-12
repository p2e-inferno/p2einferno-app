# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep changes minimal, aligned with existing patterns, and repo‑specific.

## Quick Commands
```bash
npm run dev                 # http://localhost:3000
npm run dev -- --turbo      # Turbopack (faster HMR)
npm run build && npm start  # Production build/run
npm run lint                # ESLint + Prettier check + tsc --noEmit
npm run test:coverage       # Jest + coverage (jsdom)
npm run test:e2e            # Synpress/Playwright E2E tests

# Database commands
npm run db:migrate          # Apply Supabase migrations
npm run db:types            # Generate TypeScript types from local schema
npm run db:types:remote     # Generate types from remote schema
npm run db:seed             # Reset DB with migrations + seed data

# E2E Testing (first-time setup)
npx synpress ./tests/wallet-setup  # Build MetaMask wallet cache
# Note: If cache hash mismatch error, rename folder in .cache-synpress/ to match expected hash
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
- **CLI Version**: v2.48.3 (keep updated regularly for security patches)
- **Preferred**: Supabase CLI. If unsure, run `supabase --help`.
- **Target selection**: Use `NEXT_PUBLIC_SUPABASE_URL` to detect local vs remote.
- **Secrets**: DB password in `.env.local` (do not commit). Migrations live in `supabase/migrations/`.
- **Common commands**:
  - `supabase start|stop` - Local Supabase instance
  - `supabase db reset` - Reset local DB with migrations + seed data
  - `supabase link --project-ref <ref>` - Link to remote project
  - `supabase db push` - Push migrations to remote
  - **Migration naming**: Follow pattern `###_description.sql` (e.g., `069_fix_sql_ambiguity.sql`)

### Type Generation
- **Auto-generate types**: `npm run db:types` (from local schema)
- **From remote**: `npm run db:types:remote` (requires SUPABASE_PROJECT_ID)
- **Location**: Types generated to `lib/supabase/types-gen.ts`
- **Workflow**: Regenerate types after schema changes to keep TypeScript in sync

### Seed Data
- **File**: `supabase/seed.sql` - Sample data for local development
- **Usage**: Automatically applied on `supabase db reset`
- **Purpose**: Consistent local environment with test bootcamps, cohorts, and quests

### Database Security Best Practices
- **Function Security**: All PL/pgSQL functions MUST include `SET search_path = 'public'` to prevent SQL injection via search_path manipulation
  - **CRITICAL**: All trigger functions, SECURITY DEFINER functions, and any function called by service_role MUST have this directive
  - Without it, functions may fail silently when called by admin operations (service_role context)
  - Example pattern:
    ```sql
    CREATE OR REPLACE FUNCTION public.my_trigger_function()
    RETURNS TRIGGER
    SET search_path = 'public'  -- REQUIRED
    AS $$
    BEGIN
      -- function body
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    ```
- **SECURITY DEFINER**: Use sparingly and only when necessary. Always combine with `SET search_path` when used.
- **Views**: Avoid `SECURITY DEFINER` on views; use RLS policies instead for access control
- **Foreign Key Indexes**: All foreign key columns should have covering indexes for JOIN performance
- **RLS Policies**: Use `(select auth.uid())` instead of `auth.uid()` to move function to initialization plan (major perf boost)
- **Reference**: See `docs/supabase-security-performance-advisory.md` and `docs/database-function-security-audit.md` for full security audit results

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

## Key Manager Patterns (Server-Side Grant Keys)
When granting keys server-side, use `getKeyManagersForContext()` from `lib/helpers/key-manager-utils.ts` to determine the correct key managers array. **Never pass an empty array** - this causes "Array index out of bounds" contract errors.

### Contexts and Patterns:
- **`payment`**: User paid for enrollment → User manages key
  - Pattern: `[recipientAddress]`
  - Used in: Payment verification flow
  - Rationale: User purchased access, should control their key

- **`milestone`**: User earned through tasks → Admin manages key
  - Pattern: `[adminAddress]` (from `LOCK_MANAGER_PRIVATE_KEY`)
  - Used in: Milestone claim flow
  - Rationale: Milestone keys are non-transferable credentials

- **`admin_grant`**: Admin manually granting access → User manages key
  - Pattern: `[recipientAddress]`
  - Used in: Admin grant-key API
  - Rationale: Admin-granted access should be controlled by recipient

- **`reconciliation`**: Retrying failed payment grants → User manages key
  - Pattern: `[recipientAddress]`
  - Used in: Reconciliation/retry flows
  - Rationale: Same as original payment context

### Example Usage:
```ts
import { getKeyManagersForContext } from '@/lib/helpers/key-manager-utils';

const grantResult = await grantKeyService.grantKeyToUser({
  walletAddress: userAddress,
  lockAddress: lockAddress as `0x${string}`,
  keyManagers: getKeyManagersForContext(
    userAddress as `0x${string}`,
    'payment' // or 'milestone', 'admin_grant', 'reconciliation'
  ),
});
```

### Anti-Pattern (DO NOT DO):
```ts
// ❌ Never use empty array - causes contract revert
keyManagers: []

// ❌ Don't hardcode - use the helper function
keyManagers: [userAddress]
```