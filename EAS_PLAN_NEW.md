EAS Schema Manager - Implementation Plan (Updated)

Overview
Add an admin-facing EAS Schema Manager to deploy and manage Ethereum Attestation Service schemas without manual scripts.
User requirements:
- New admin page at /admin/eas-schemas
- Server-side schema deployment (gasless for admins)
- Features: deploy new schemas, sync existing schemas, view all schemas

This plan updates the earlier version to:
- Fix critical implementation gaps (network-aware clients, schema UID lookup, retry idempotency, migration impacts).
- Make EAS config database-driven, not hardcoded.
- Seed the database with official EAS contract addresses from the EAS contracts repo.
- Align admin write auth with the gasless attestation pattern used in /Users/applemac/Documents/projects/teerex.
- Include non-blocking improvements (reconciliation validation, idempotency, immutability warnings).

1. Current State Summary
What already exists
- EAS SDK integration (v2.7.0) and attestation flow operational.
- Database tables: attestation_schemas with constraints and RLS.
- Registry functions: lib/attestation/schemas/registry.ts provides CRUD operations.
- Schema definitions: 4 predefined schemas (daily check-in, quest, bootcamp, milestone).
- Config: SCHEMA_REGISTRY_ABI defined in lib/attestation/core/config.ts.
- Feature flag: NEXT_PUBLIC_ENABLE_EAS toggles on-chain vs database-only mode.
- Blockchain patterns: grant-key-service.ts is a template for server-side signing and retries.

What is missing
- Admin UI for schema deployment.
- API routes for schema operations.
- Schema deployment service layer.
- Network-aware client creation for admin-selected networks.
- Network-aware schema UID lookup for runtime (multi-network safe).
- Database-driven EAS contract configuration and seed data.
- Schema UID reconciliation behavior that is idempotent and validated.

What should not be duplicated
- Database schema for attestations (no new tables for attestations themselves).
- Registry helpers (extend, do not replace).
- Admin auth patterns (withAdminAuth + ensureAdminOrRespond).
- Logging style (getLogger).

2. Design Decisions (Updated)
Decision 1: Reuse LOCK_MANAGER_PRIVATE_KEY
- Use existing LOCK_MANAGER_PRIVATE_KEY for schema deployment.
- Rationale: already validated; aligns with other server-side blockchain actions.

Decision 2: Viem-based implementation
- Migrate deployment logic from ethers scripts to viem.
- Rationale: codebase is standardizing on viem; matches grant-key-service.ts patterns.

Decision 3: Pages API routes
- Use /pages/api/admin/eas-schemas/*.
- Rationale: consistent with 95 percent of admin APIs; avoids App Router changes.

Decision 4: Dedicated admin page
- Create /pages/admin/eas-schemas.tsx (not extending blockchain.tsx).

Decision 5: Database-driven EAS config (new)
- Replace hardcoded EAS_CONFIG with a database-backed EAS network config table.
- Rationale: separation of concerns, easy updates, multi-network support.

Decision 6: Network-aware schema UID lookup (new)
- Store app-level schema keys in the DB and resolve by network.
- Rationale: avoid ambiguous global env vars in multi-network mode.

Decision 7: Admin write auth requires a signed action (new)
- For mutating endpoints, require a signed message from the active admin wallet.
- Rationale: align with gasless attestation flow in Teerex (user signs, backend verifies, service wallet sends transaction).

3. Implementation Architecture

3.1 Database-Driven EAS Network Config
New table: eas_networks (or eas_config)
- Columns (suggested):
  - name (text, primary key) e.g., base, base-sepolia
  - chain_id (int, unique)
  - display_name (text)
  - is_testnet (bool)
  - enabled (bool, default false; UI/API only expose enabled networks)
  - eas_contract_address (text)
  - schema_registry_address (text)
  - eip712_proxy_address (text, nullable)
  - eas_scan_base_url (text)
  - explorer_base_url (text, nullable)
  - rpc_url (text, nullable; optional override, fallback to existing RPC env config)
  - source (text) e.g., eas-contracts repo
  - source_commit (text) for auditability
  - updated_at (timestamp)

Seed data
- Use static, verified addresses (no GitHub/CI fetching).
- Insert these values directly in the migration seed (include explorer_base_url):
  - optimism-mainnet (chainId 10)
    - EAS: 0x4200000000000000000000000000000000000021
    - SchemaRegistry: 0x4200000000000000000000000000000000000020
    - Explorer: https://optimistic.etherscan.io
  - optimism-sepolia (chainId 11155420)
    - EAS: 0x4200000000000000000000000000000000000021
    - SchemaRegistry: 0x4200000000000000000000000000000000000020
    - Explorer: https://optimistic.etherscan.io
  - base (chainId 8453)
    - EAS: 0x4200000000000000000000000000000000000021
    - SchemaRegistry: 0x4200000000000000000000000000000000000020
    - Explorer: https://base.blockscout.com
  - base-sepolia (chainId 84532)
    - EAS: 0x4200000000000000000000000000000000000021
    - SchemaRegistry: 0x4200000000000000000000000000000000000020
    - Explorer: https://base.blockscout.com
  - ethereum-mainnet (chainId 1)
    - EAS: 0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587
    - SchemaRegistry: 0xA7b39296258348C78294F95B872b282326A97BDF
    - Explorer: https://etherscan.io
  - arbitrum-one (chainId 42161)
    - EAS: 0x72E1d8ccf5299fb36fEfD8CC4394B8ef7e98Af92
    - SchemaRegistry: 0x5ece93bE4BDCF293Ed61FA78698B594F2135AF34
    - Explorer: https://arbiscan.io
  - arbitrum-nova (chainId 42170)
    - EAS: 0x21d8d4eE83b80bc0Cc0f2B7df3117Cf212d02901
    - SchemaRegistry: 0xB8566376dFe68B76FA985D5448cc2FbD578412a2
    - Explorer: https://nova.arbiscan.io

Seed strategy
- Add a migration to create the table.
- Insert the static rows above directly in the migration.
- No GitHub fetch, no CI seeding, no external dependency.

3.2 Network Config Access Layer
Create lib/attestation/core/network-config.ts (DB-backed)
- getNetworkConfig(name): loads from eas_networks table.
- getAllNetworks(): returns available networks.
- getDefaultNetwork(): uses NEXT_PUBLIC_BLOCKCHAIN_NETWORK or fallback to base-sepolia.

Update lib/attestation/core/config.ts
- Keep existing EAS_CONFIG as a fallback layer.
- Add a resolver that prioritizes DB config, then env, then EAS_CONFIG.
- Cache DB results with short TTL to reduce runtime DB dependency.
- Client uses a lightweight API endpoint that also returns the fallback if DB is unavailable.

3.3 Network-Aware Client Creation (Critical Fix)
Add network-specific factory functions
- createWalletClientForNetwork(networkConfig)
- createPublicClientForNetwork(networkConfig)
- Use networkConfig.chain_id and networkConfig.rpc config.

Note
- This fixes the bug where admin-selected network differs from app default.

3.4 Network-Aware Schema UID Lookup (Critical Fix)
Add schema_key or schema_type to attestation_schemas
- Example values: daily_checkin, quest_completion, bootcamp_completion, milestone_achievement.
- Update predefined rows with schema_key values.

Lookup strategy
- getSchemaUidForNetwork(schemaKey, network):
  - SELECT schema_uid FROM attestation_schemas WHERE schema_key = ? AND network = ?.
- Cache results in memory (short TTL) to avoid frequent DB hits.
- Fallback to existing env-based schema UID when DB lookup fails or network not found.
- Keep requireSchemaUID for existing call sites; introduce resolveSchemaUID for new flows.

3.5 Service Layer (Schema Deployment)
File: lib/blockchain/services/schema-deployment-service.ts
Functions
- deploySchema(walletClient, publicClient, networkConfig, params, maxRetries?, retryDelay?)
- verifySchemaOnChain(publicClient, networkConfig, schemaUid)
- getSchemaFromTransaction(publicClient, networkConfig, transactionHash)

Critical fix: retry idempotency
- Send transaction once and re-use txHash on retries.
- Never re-broadcast after a txHash exists to avoid duplicate schema UIDs.

Reconciliation validation (non-blocking improvement)
- Confirm receipt.to matches SchemaRegistry address.
- Confirm receipt.status is success.
- Extract schema UID from logs with robust parsing.

3.6 API Routes
Pages API routes:
1) /pages/api/admin/eas-schemas/index.ts
- GET: list schemas with optional category and network filters.
- POST: deploy schema (validation -> deploy -> DB save).

2) /pages/api/admin/eas-schemas/[uid].ts
- GET: schema details with attestation count.
- PATCH: update metadata (name, description only).

3) /pages/api/admin/eas-schemas/sync.ts
- POST: import existing on-chain schema to DB.

4) /pages/api/admin/eas-schemas/reconcile.ts
- POST: recover DB insert after on-chain deploy.
- Idempotent: returns success if already stored (non-blocking improvement).

Auth pattern
- Use withAdminAuth for Pages API routes.
- For mutations (POST/PATCH/DELETE), require:
  - X-Active-Wallet header (existing withAdminAuth requirement).
  - Signed admin action payload (new requirement).

Signed admin action requirement (Teerex-aligned)
- Client signs a message or EIP712 typed data describing:
  - action (deploy/sync/reconcile/update)
  - network
  - schema definition hash
  - timestamp + nonce
- API verifies signature server-side and matches X-Active-Wallet.
- This mirrors Teerex gasless attestation: user signs, backend verifies, service wallet sends the transaction.
- Replay protection: store nonce + wallet + action hash in a dedicated table with a unique constraint.
- Reject replays and expired timestamps; cleanup via TTL job or scheduled delete.

3.7 Admin Page and UI Components
Admin page: /pages/admin/eas-schemas.tsx
- Tabs: All Schemas, Deploy New, Sync Existing.
- Network selector at top, backed by eas_networks data.

Components
- NetworkSelector
- SchemaDeploymentForm
- SchemaListTable
- SchemaSyncPanel
- SchemaDetailsCard

Add schema immutability warning (non-blocking improvement)
- Confirmation dialog before deploy: "Schema registration is irreversible. Continue?"

3.8 Migration Changes (Critical Fix)
New migration: add network column to attestation_schemas
- Add network column with default base-sepolia.
- Add unique constraint (schema_uid, network).
- Add index on network.
- Add schema_key column for network-aware lookup.

Audit step (critical)
- Before migration, verify existing schema rows and assign correct network.
- Update all code paths querying by schema_uid to include network filter.
- Add attestations.network column with default from app network.
- Backfill attestations.network by joining attestation_schemas on schema_uid.
- Add composite FK (schema_uid, network) NOT VALID, validate after backfill.
- Keep the existing FK on schema_uid until composite FK validates, then drop old FK.
- Only relax global schema_uid uniqueness after the composite FK is fully validated.

4. Security Measures
Private key handling
- Use LOCK_MANAGER_PRIVATE_KEY server-side only.
- Never log or expose in responses.
- Check isServerBlockchainConfigured() before any on-chain operation.

Admin authorization
- withAdminAuth on all routes.
- Active wallet required for writes (existing behavior).
- Signed admin action required for schema deployment actions (new).
- Nonce table enforces one-time signatures (prevents replay).

Input validation
- Schema definition format via isValidSchemaDefinition().
- Name 1-100 chars; description 1-500 chars.
- Schema UID regex: ^0x[a-fA-F0-9]{64}$.
- Network name must exist in eas_networks.

Failure safeguards
- Blockchain failures: no DB writes; clear error messages.
- DB failures: retry insert, return txHash + schemaUid for reconciliation.
- Reconciliation idempotency (non-blocking improvement).

5. Environment Configuration (Updated)
Required variables (existing)
- LOCK_MANAGER_PRIVATE_KEY
- NEXT_PUBLIC_ENABLE_EAS
- NEXT_PUBLIC_BLOCKCHAIN_NETWORK (already used in codebase)

No new schema UID env vars
- Schema UIDs resolved from database by schema_key + network.
Optional operational flags
- None (static seed only)

6. Implementation Steps

Phase 0: Database-Driven EAS Config
- Create table eas_networks.
- Add server-side config loader utilities.
- Add enabled flag and default only base + base-sepolia to enabled.
- Insert static network rows in migration (no external fetch).

Phase 1: Network-Aware Schema Model
- Add network and schema_key columns to attestation_schemas.
- Update registry functions to accept network.
- Update schema lookup paths to include network filters.
- Add attestations.network with backfill and composite FK validation path.

Phase 2: Network-Aware Clients
- Add createWalletClientForNetwork and createPublicClientForNetwork.
- Ensure correct chain used for admin-selected network.
- Resolve RPC URL from eas_networks.rpc_url if set, else use existing RPC env config.

Phase 3: Service Layer
- Implement schema-deployment-service.ts with idempotent retry.
- Add log parsing and validation.

Phase 4: API Routes
- Implement App API endpoints (deploy/list/sync/reconcile).
- Add signed admin action verification.
- Add reconciliation idempotency.

Phase 5: UI Components + Admin Page
- Build /pages/admin/eas-schemas.tsx.
- Implement form, list, sync panels, and details card.
- Add network selector and immutability warnings.

Phase 6: Testing + Docs
- Unit tests for service layer.
- Integration tests for API routes.
- Update docs/CLAUDE.md with new EAS Schema Manager workflow.
- Document DB-driven EAS config and seeding process.

7. Critical Files Reference
Files to create (new)
- lib/attestation/core/network-config.ts
- lib/blockchain/services/schema-deployment-service.ts
- app/api/admin/eas-schemas/index.ts
- app/api/admin/eas-schemas/[uid].ts
- app/api/admin/eas-schemas/sync.ts
- app/api/admin/eas-schemas/reconcile.ts
- app/admin/eas-schemas.tsx
- components/admin/eas-schemas/NetworkSelector.tsx
- components/admin/eas-schemas/SchemaDeploymentForm.tsx
- components/admin/eas-schemas/SchemaListTable.tsx
- components/admin/eas-schemas/SchemaSyncPanel.tsx
- components/admin/eas-schemas/SchemaDetailsCard.tsx

Files to modify
- lib/attestation/core/config.ts (remove hardcoded EAS_CONFIG, use DB-driven loader)
- lib/attestation/schemas/registry.ts (add network + schema_key support)
- components/layouts/AdminLayout.tsx (add nav item)

Migrations
- supabase/migrations/118_add_network_to_schemas.sql
- supabase/migrations/119_add_eas_networks.sql

8. Risk Mitigation (Updated)
- Transaction log parsing: add validation and fallback parsing, and reconciliation endpoint.
- DB save failures: retry insert, return txHash + schemaUid.
- Duplicate schema UID: check DB before deployment and treat reconciliation idempotently.
- Migration impact: audit existing data and update all queries to include network.
- RPC rate limits: reuse existing fallback providers and throttle UI polling.
- DB config dependency: cache + fallback to env/static config to avoid runtime outages.
- Network exposure: enforce enabled networks in API validation and UI listing.

9. Out of Scope
- Automatic .env updates for schema UIDs.
- Schema versioning.
- Batch schema deployments.
- Analytics dashboards.

10. Success Criteria
- Admin can deploy schemas via UI on selected network.
- Admin can sync existing schemas from chain.
- Admin can view, filter, and edit schema metadata per network.
- DB contains seeded EAS network config with official addresses.
- All writes are authorized by admin session + active wallet + signed action.
- Reconciliation endpoint is safe and idempotent.

11. Estimated Implementation Time
Phase 0: 3-4 hours
Phase 1: 4-6 hours
Phase 2: 3-4 hours
Phase 3: 5-7 hours
Phase 4: 7-9 hours
Phase 5: 9-12 hours
Phase 6: 5-7 hours
Total: 36-49 hours

12. Rollback Plan
- Disable nav item in AdminLayout.
- Revert migrations if needed.
- On-chain schemas remain immutable; DB can be re-synced later.

SECTION 13. Schema UID Hardcoding Fix (Critical Follow-Up)
Goal
Ensure all runtime schema selection is based on (schema_key, network) instead of hardcoded placeholder UIDs, so deploying to EAS and updating the DB automatically drives production behavior.

Plan for Review
1) Audit Findings (scope of fix)
Hardcoded placeholders found in:

SQL / migrations:
062_attestation_system.sql
070_secure_all_functions_search_path.sql
096_add_user_activities_streak_calculation.sql
082_unify_bootcamp_completion_schema.sql
102_perform_daily_checkin_tx.sql
Runtime TS / hooks:
queries.ts (direct UID filter)
useAttestationQueries.ts (daily check‑in)
useCertificateClaim.ts
definitions.ts (currently uses requireSchemaUID)
config.ts exposes env placeholders
Important: Most SQL code assumes the placeholder UID, which will break once the DB UID is replaced after EAS deployment.

2) DB Schema + Data Strategy (foundation)
Already present: schema_key + network in attestation_schemas.

New rule:
Runtime lookups must use (schema_key, network)
Hardcoded UIDs should only appear in migration seeds, never in code.

Additions / changes:

Ensure schema_key is NOT NULL for seeded schemas (can be enforced post‑backfill).
For daily check‑in and other schema‑dependent SQL functions, store a canonical schema_key lookup, not UID.
3) SQL / Migration Fix Strategy (critical)
3.1 Replace hardcoded UID in SQL functions & queries
Create new migration that:

Updates all functions or views that reference schema_uid = '0xp2e_*' to instead:
Join attestation_schemas on schema_key + network, and use its current UID.
Example pattern inside SQL:
SELECT s.schema_uid
INTO v_schema_uid
FROM public.attestation_schemas s
WHERE s.schema_key = 'daily_checkin'
  AND s.network = current_network;
If a function doesn’t have a network context, use a config default:
current_setting('app.network', true) or
fallback to NEXT_PUBLIC_BLOCKCHAIN_NETWORK injected as SQL parameter.
3.2 Add a small helper SQL function
Introduce a reusable DB helper:

CREATE OR REPLACE FUNCTION public.get_schema_uid(p_schema_key TEXT, p_network TEXT)
RETURNS TEXT
...
This isolates schema resolution and makes SQL changes safer.

4) Runtime Code Changes (TS / hooks)
4.1 Single source of truth
Use the existing network-aware resolver (network-resolver.ts) everywhere instead of env UIDs.

Changes:

Deprecate P2E_SCHEMA_UIDS for runtime usage; keep env fallback only.
Update:
useCertificateClaim.ts
useAttestationQueries.ts
queries.ts
definitions.ts
All should call:

resolveSchemaUid(schemaKey, network)
with DB → env fallback.

5) Safety / Rollout Steps
Phase A: Add DB helper function + migration updates (no runtime change yet)
Phase B: Switch runtime code to schema_key lookup
Phase C: Deploy schema on EAS and update DB UID
Phase D: Remove / ignore env placeholders
This ensures old behavior still works until deployment.
Note: Schema UID "replacement" must be insert-based (add a new row) rather than update-in-place to preserve the attestations FK.

6) Testing / Verification
Add integration tests for schema lookup:
DB returns correct UID when schema_key + network exists
Fallback to env if DB missing
For SQL migration: add verification query:
SELECT schema_key, network, schema_uid FROM attestation_schemas WHERE schema_key IS NOT NULL;
Validate daily check‑in and streak functions using real UID

Clarifications (Network Context in SQL)
- Do not rely on `current_setting('app.network', true)` unless the app explicitly sets it for every DB session (Supabase does not provide this by default).
- Preferred approach: pass `network` explicitly to SQL helpers/functions that need it (e.g., `get_schema_uid(p_schema_key, p_network)`), and have callers supply the resolved network name.

14. Schema Key Management (Admin UX + Consistency)
Goal
Keep schema keys consistent across admins by making keys selectable (not free‑text) and centrally managed with validation + normalization.

Design Principles
- KISS: one small table, one small admin panel, no separate app.
- DRY: single source of truth for keys used by deploy/sync flows.
- Scalable: supports future schema upgrades by reusing the same key.

Plan for Review
1) Database
Create a new table `eas_schema_keys` as the canonical source of schema keys.

Migration (new)
- File: supabase/migrations/12x_add_eas_schema_keys.sql
- Table columns:
  - key (text, primary key) — normalized snake_case
  - label (text, required) — human‑readable
  - description (text, optional)
  - active (bool, default true)
  - created_at / updated_at (timestamps, update trigger)
- Seed rows for existing keys:
  - daily_checkin, quest_completion, bootcamp_completion, milestone_achievement
- RLS: read for authenticated, write for service role (matching existing admin patterns).

Constraints + Relationships (Integrity)
- Do NOT enforce `UNIQUE(schema_key, network)` on `attestation_schemas`.
  - Rationale: upgrading schemas must not break the existing FK from `attestations(schema_uid, network)` → `attestation_schemas(schema_uid, network)`.
  - Updating a row’s `schema_uid` in-place would orphan historical attestations and violate the FK.
- Add an index for efficient “latest schema for key+network” lookups:
  - `CREATE INDEX IF NOT EXISTS idx_attestation_schemas_schema_key_network_created_at ON public.attestation_schemas(schema_key, network, created_at DESC) WHERE schema_key IS NOT NULL;`
- Add a foreign key from `attestation_schemas.schema_key` → `eas_schema_keys.key`:
  - `FOREIGN KEY (schema_key) REFERENCES public.eas_schema_keys(key) ON DELETE RESTRICT`
  - Migration safety: backfill/seed keys first; add FK as `NOT VALID`; validate after ensuring no orphan keys.

Why
- Prevents drift between admins.
- Allows upgrades: schema_uid changes while key remains stable.

Schema Key Lifecycle (Policy)
- `active=false` means:
  - The key remains valid for existing rows/history.
  - Admin UI and schema deploy/sync endpoints must reject selecting inactive keys for new deployments/sync.
  - Prefer soft-disable over delete; avoid hard deletes to prevent orphan references.
- Upgrades/changes:
  - Keep the same `schema_key` for the schema “type”.
  - When upgrading a schema, deploy a new schema UID on-chain and INSERT a new `attestation_schemas` row with the same `(schema_key, network)` and the new `schema_uid`.
  - Application lookups should select the “current” schema by `(schema_key, network)` ordered by `created_at DESC` (latest wins).
  - Historical attestations continue referencing older `schema_uid` rows, preserving FK integrity and history automatically.

2) API Routes (Admin)
Add App Route handlers to manage schema keys.

New routes
- app/api/admin/eas-schema-keys/route.ts
  - GET: list keys (filter active by default; allow `?includeDisabled=1`)
  - POST: create key (validation + normalization)
- app/api/admin/eas-schema-keys/[key]/route.ts
  - PATCH: update label/description/active
  - DELETE: soft-delete by setting active=false (preferred over hard delete)

Validation + Normalization
- Normalize on server: trim → lowercase → replace spaces with `_` → remove invalid chars.
- Enforce regex: `^[a-z0-9_]+$`
- Reject duplicates (PK constraint).

Why
- Keeps API authoritative and prevents bad keys.
- Avoids runtime inconsistencies.

3) UI Updates (Admin)
Update deploy/sync UI to select keys from the DB, and add a management panel in EAS Config.

Files to update
- components/admin/eas-schemas/SchemaDeploymentForm.tsx
  - Replace schema_key input with Select.
  - Source options from `eas-schema-keys` (active only).
  - Display helper text: “Manage keys in EAS Config → Schema Keys.”
- components/admin/eas-schemas/SchemaSyncPanel.tsx
  - Same select + helper text.
- components/admin/eas-schemas/EasConfigPanel.tsx
  - Add a “Schema Keys” subsection:
    - List keys (label + key + active toggle)
    - Add / Edit (label, description) + Disable
    - No hard delete (use active=false).

Why
- Prevents typo/variant keys.
- Keeps UX consistent across admins.

4) Shared Helpers
Add a small helper module for normalization.
- New file: lib/attestation/schemas/schema-key-utils.ts
  - normalizeSchemaKey(input: string): string
  - isValidSchemaKey(input: string): boolean

Why
- Reuse across API + UI (DRY).

5) Tests
Add tests for the new key management surface.

Integration tests
- __tests__/integration/app/api/admin/eas-schema-keys.test.ts
  - GET returns active keys
  - POST rejects invalid keys
  - PATCH toggles active flag
  - DELETE soft‑disables (or PATCH with active=false)

Unit tests
- __tests__/unit/lib/attestation/schemas/schema-key-utils.test.ts
  - normalization rules
  - validation rules

Expected Outcome
- Admins pick schema keys from a curated list.
- Schema key consistency across teams.
- Safe upgrades: schema_uid can change without breaking app logic.
