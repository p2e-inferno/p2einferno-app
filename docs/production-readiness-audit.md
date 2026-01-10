# Production Readiness Audit

Date: 2026-01-05

## Scope and Method
- Static repo review only (no runtime testing).
- Sources: README, docs, config, route inventory, and key API/feature folders.
- Results show what appears implemented; production readiness still needs staging validation.

## Current Functionality Inventory (Based on Code)

### Public/Marketing
- Home, about, how-it-works, services pages.
- Bootcamps landing and cohort details.
- Application flow: `/apply`, `/apply/[cohortId]`.

### Core User App (Lobby)
- Lobby dashboard with stats, quick actions, notifications, and profile.
- Quests and task submissions, achievements, bounties, events.
- Daily check-ins, streaks, XP accrual, and retryable UX.
- Bootcamp completion flows, certificate preview/claim, and attestation hooks.
- Wallet management, ENS resolution, and balance polling gated by UI.
- GoodDollar face verification flows.

### Payments and Subscriptions
- Paystack payment flow and webhooks.
- Blockchain payments via Unlock Protocol.
- Subscription renewals using XP and crypto (see xp-renewal docs).
- Token withdrawal flows (DG token, withdrawal limits, history).

### Admin
- Admin dashboard, bootcamps, cohorts, milestones, tasks, submissions.
- Quest management (create/edit, submissions, highlights).
- Payments, withdrawal limits, lock manager/admin lock helpers.
- Admin session model and new Route Handlers for cache invalidation.

### Backend and Data
- Pages API for bootcamps, applications, cohorts, quests, payments, check-ins.
- Route Handlers under `app/api` for admin sessions, milestones, tasks, cohorts, submissions.
- Supabase migrations for the full schema; Edge function for blockchain payment verification.

## Readiness Signals (What Looks Solid)
- CSP headers enforced in `next.config.js` with a reporting endpoint.
- Auth configuration validation exists (`lib/auth/config-validation.ts`).
- Admin session model and guard utilities are implemented.
- Logging utility with structured output is in place.
- Unit tests exist for a number of API routes, hooks, and blockchain utilities.
- E2E test harness exists via Synpress + Playwright.

## Risks / Gaps to Resolve Before Production
- Public dev/test pages exist under `pages/test/*` (should be removed, gated, or disabled in prod).
- CSP report endpoint uses in-memory rate limiting and has a placeholder external logger (not production-safe across multiple instances).
- Supabase migration TODO: `supabase/migrations/087_configurable_withdrawal_limits.sql` includes a note to add proper admin checks.
- Admin session middleware is disabled by default; production should decide on enforcement and validate retry/session flows.
- Payment and webhook flows require live key configuration and validation in staging (Paystack + Unlock + Supabase Edge).
- Verify that admin-only Pages API endpoints and admin UI routes are all protected as expected.

## Pre-Production Checklist (Must Do)

### Configuration and Secrets
- Populate `.env` with production values (`NEXT_PUBLIC_APP_URL`, Privy, Supabase, Paystack, Unlock, RPCs).
- Set strong `ADMIN_SESSION_JWT_SECRET` and decide `ADMIN_SESSION_ENABLED` behavior.
- Confirm RPC configuration (Alchemy/Infura/Base) to avoid public RPC throttling.

### Security and Access
- Remove or protect `pages/test/*` routes.
- Confirm CSP behavior in production (monitor `/api/security/csp-report`).
- Verify admin session issuance/refresh flow (`/api/admin/session`) in production.
- Revisit migration TODO and ensure admin checks for withdrawal limits are enforced.

### Database and Supabase
- Apply all migrations against production (`supabase db push` or `npm run db:migrate`).
- Deploy edge functions (verify-blockchain-payment).
- Verify RLS policies and service-role usage where required.

### Payments and Blockchain
- Validate Paystack webhook signing and production keys.
- Test Unlock payment + key grants on mainnet environment.
- Confirm good-dollar and token-withdrawal flows with mainnet contracts.

### Observability
- Decide logging levels (`LOG_LEVEL`) and whether to stream logs to a provider.
- Replace CSP external logging placeholder if you want alerts.

### Testing and QA
- Run `npm run lint`, `npm test`, and `npm run test:e2e` in staging.
- Smoke-test: auth, onboarding, apply flow, payments, check-ins, quests, admin flows.

## Post-Production Follow-Ups (Can Ship After)
- Replace CSP report in-memory limit with centralized storage or rate limiting.
- Add structured external logging/alerting for CSP and auth failures.
- Reduce CSP `unsafe-inline` usage via nonces/hashes where feasible.
- Remove deprecated Pages API endpoints once admin migration is complete.
- Expand E2E coverage for payments, admin workflows, and withdrawals.

## Recommended Execution Plan
1. Create a staging environment mirroring production configs.
2. Run the pre-production checklist, fix blockers, then do a staged release.
3. Monitor CSP reports, payment webhooks, and admin session errors during the first 48 hours.
4. Address post-production follow-ups in a small, time-boxed iteration.
