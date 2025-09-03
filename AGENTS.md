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
- Locations: colocate tests or use `**/*.(test|spec).(ts|tsx)` across `components/`, `pages/`, `lib/`, `hooks/`.
- Coverage: collected from UI, lib, hooks; use `npm run test:coverage` for reports.
- Mocks: see router/Privy/crypto mocks in `jest.setup.ts`.

## Logging
- Module logger: Use `getLogger(module)` from `lib/utils/logger`. Levels: `debug|info|warn|error`; pretty in dev, JSON in prod.
- Example (API route): `const log = getLogger('api:milestone-tasks'); log.error('db error', { milestoneId, err });`
- Client usage: safe for browser; control with `NEXT_PUBLIC_LOG_LEVEL` (`debug` default in dev).
- Env: `LOG_LEVEL` (server), `NEXT_PUBLIC_LOG_LEVEL` (client). Use `silent` to disable.
- Blockchain: `blockchainLogger` is bridged to the same transport; prefer existing methods in `lib/blockchain/shared/logging-utils`.

## Commit & Pull Request Guidelines
- Commits: Prefer Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Keep messages imperative and scoped (e.g., `feat(wallet): add chain selector`).
- PRs: Clear description, rationale, and screenshots for UI. Link issues, list breaking changes, include test notes and manual steps. Keep PRs focused and small.

## Security & Configuration Tips
- Never commit secrets. Use `.env.local` for `NEXT_PUBLIC_*`, Supabase, Privy, Paystack, RPC keys (see `README.md`).
- Validate config on startup (`lib/auth/config-validation.ts`).
- Review CSP and auth docs in `docs/` before changing security-sensitive code.
- Database changes must include Supabase migrations in `supabase/migrations/` and be applied with `db:migrate`.
