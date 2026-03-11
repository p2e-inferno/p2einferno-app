# Daily Quests Implementation Plan

## Feature Summary
Introduce a new “Daily Quests” system that lets admins define reusable daily quest templates, publishes one active quest instance per day, verifies task completion (on-chain + in-app), grants per-task xDG rewards, grants an additional template completion bonus (admin-defined, not derived from tasks), and grants a daily completion key on final claim (same key-claim lifecycle as standard quests). The feature must be additive and preserve existing quest flows.

## Scope
In scope:
- New daily quest domain model (templates, tasks, per-day runs, user progress, task completions, final claim).
- Admin create/manage flows for daily quests in a separate tab from existing quests, including lock address setup and optional auto lock deployment during template creation.
- User quests page split into `Quests` and `Daily Quests` tabs.
- Constraint-based eligibility (vendor level, GoodDollar verification, lock key ownership, ERC20 balance).
- Daily refresh behavior (new run each UTC day while template is active).
- Telegram broadcast on creation and first refresh publication each day.
- Reuse existing verification stack where possible (vendor + deploy lock + replay prevention patterns).
- Reuse existing key grant stack for final claim (`grantKeyToUser`, `createWalletClientUnified`, `createPublicClientUnified`).

Out of scope:
- Reworking existing standard quest schema/flows.
- New external dependencies.
- A complete generic quest engine rewrite.

## Goals and Non-Goals
Goals:
- Add daily quests without regression to current `quests` endpoints/UI.
- Enforce “unique per day, no replay” at DB + API layers.
- Keep verification and auth consistent with existing patterns (`useAdminApi`, `ensureAdminOrRespond`, `withAdminAuth`).
- Keep completion reward semantics aligned with standard quests (final claim grants key to configured lock and stores tx/token metadata).
- Keep operational model simple (deterministic day boundaries in UTC).

Non-goals:
- Multi-timezone per-user day windows in v1.
- Complex campaign orchestration (weekly chains, seasonal rotations).
- Replacing existing quest rewards/claim semantics outside daily quests.

## Affected Files
Existing files to update:
- `lib/supabase/types.ts`
- `components/admin/QuestForm.tsx` (tab shell only)
- `pages/admin/quests/new.tsx` (tab shell only)
- `pages/admin/quests/index.tsx` (list tabs)
- `pages/lobby/quests/index.tsx`
- `components/quests/quest-list.tsx` (split rendering path)
- `hooks/useQuests.ts` (standard quests remains untouched, but shared tab page composes both)
- `lib/quests/taskVerificationMethod.ts` (map `daily_checkin` to `"automatic"` and set deterministic verification method for daily blockchain tasks)
- `lib/quests/vendor-task-config.ts` (reuse `validateVendorTaskConfig` for `deploy_lock` + `uniswap_swap` task_config validation)
- `lib/quests/verification/registry.ts` (register `daily_checkin` strategy)
- `lib/notifications/telegram.ts` (add daily quest notification type mapping)
- `lib/services/user-key-service.ts` (reuse existing key grant path, no new service)
- `lib/blockchain/config/clients/wallet-client.ts` (reuse for server signer client in final claim)
- `lib/blockchain/config/clients/public-client.ts` (reuse for receipt + tokenId extraction)
- `lib/blockchain/shared/transaction-utils.ts` (reuse `extractTokenTransfers` for tokenId extraction in final claim)

New files (expected):
- `supabase/migrations/151_daily_quests.sql`
- `app/api/admin/daily-quests/route.ts`
- `app/api/admin/daily-quests/[dailyQuestId]/route.ts`
- `pages/admin/quests/daily/new.tsx`
- `pages/admin/quests/daily/[dailyQuestId]/edit.tsx`
- `pages/api/daily-quests/index.ts`
- `pages/api/daily-quests/[runId].ts`
- `pages/api/daily-quests/[runId]/start.ts`
- `pages/api/daily-quests/complete-task.ts`
- `pages/api/daily-quests/claim-task-reward.ts`
- `pages/api/daily-quests/complete-quest.ts`
- `components/admin/DailyQuestForm.tsx`
- `components/admin/DailyQuestTaskForm.tsx`
- `components/admin/DailyQuestList.tsx`
- `components/quests/daily-quest-list.tsx`
- `components/quests/daily-quest-card.tsx`
- `pages/lobby/quests/daily/[runId].tsx`
- `hooks/useDailyQuests.ts`
- `lib/quests/daily-quests/constraints.ts`
- `lib/quests/daily-quests/runs.ts`
- `lib/quests/daily-quests/replay-prevention.ts`
- `lib/quests/verification/daily-checkin-verification.ts`

## Data Model Changes
Create separate daily quest tables to avoid risk to existing quest entities.

```sql
CREATE TABLE IF NOT EXISTS public.daily_quest_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  image_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Bonus XP awarded only after a successful daily completion key claim (not a sum of task rewards).
  completion_bonus_reward_amount integer NOT NULL DEFAULT 0,
  lock_address text NULL,
  lock_manager_granted boolean NOT NULL DEFAULT false,
  grant_failure_reason text NULL,
  eligibility_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_quest_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_template_id uuid NOT NULL REFERENCES public.daily_quest_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  task_type text NOT NULL,
  verification_method text NOT NULL,
  reward_amount integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  task_config jsonb DEFAULT '{}'::jsonb,
  input_required boolean DEFAULT false,
  input_label text NULL,
  input_placeholder text NULL,
  input_validation text NULL,
  requires_admin_review boolean DEFAULT false,
  -- v1: daily quests intentionally support a small, fully server-verifiable subset of TaskType.
  -- This avoids having to re-implement/link all account-link + submission/review flows in a new daily domain.
  CHECK(task_type IN (
    'vendor_buy',
    'vendor_sell',
    'vendor_light_up',
    'vendor_level_up',
    'deploy_lock',
    'uniswap_swap',
    'daily_checkin'
  )),
  UNIQUE(daily_quest_template_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_template_id uuid NOT NULL REFERENCES public.daily_quest_templates(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text CHECK(status IN ('active','closed')) DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(daily_quest_template_id, run_date)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_run_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_run_id uuid NOT NULL REFERENCES public.daily_quest_runs(id) ON DELETE CASCADE,
  daily_quest_template_task_id uuid REFERENCES public.daily_quest_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  task_type text NOT NULL,
  verification_method text NOT NULL,
  reward_amount integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  task_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_required boolean DEFAULT false,
  input_label text NULL,
  input_placeholder text NULL,
  input_validation text NULL,
  requires_admin_review boolean DEFAULT false,
  UNIQUE(daily_quest_run_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.user_daily_quest_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  daily_quest_run_id uuid NOT NULL REFERENCES public.daily_quest_runs(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz NULL,
  -- Final completion key claim (on-chain grant) for the run.
  reward_claimed boolean DEFAULT false,
  key_claim_tx_hash text NULL,
  key_claim_token_id numeric NULL,
  -- Bonus XP claim (DB gate + server-side XP award). Separate from reward_claimed so bonus XP can be retried without re-granting the key.
  completion_bonus_claimed boolean NOT NULL DEFAULT false,
  completion_bonus_amount integer NOT NULL DEFAULT 0,
  completion_bonus_claimed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, daily_quest_run_id)
);

CREATE TABLE IF NOT EXISTS public.user_daily_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  daily_quest_run_id uuid NOT NULL REFERENCES public.daily_quest_runs(id) ON DELETE CASCADE,
  daily_quest_run_task_id uuid NOT NULL REFERENCES public.daily_quest_run_tasks(id) ON DELETE CASCADE,
  completed_at timestamptz DEFAULT now(),
  verification_data jsonb NULL,
  submission_data jsonb NULL,
  submission_status text DEFAULT 'completed' CHECK(submission_status IN ('pending','completed','failed','retry')),
  reward_claimed boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, daily_quest_run_id, daily_quest_run_task_id)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_verified_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash text NOT NULL,
  chain_id integer NOT NULL DEFAULT 8453,
  user_id text NOT NULL,
  task_id uuid NOT NULL REFERENCES public.daily_quest_run_tasks(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  verified_amount text,
  created_at timestamptz DEFAULT now(),
  event_name text,
  block_number bigint,
  log_index integer
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quest_verified_tx_hash_lower_unique
ON public.daily_quest_verified_transactions (lower(transaction_hash));

-- Foreign key covering indexes (required per CLAUDE.md DB security guidelines)
CREATE INDEX IF NOT EXISTS idx_daily_quest_tasks_template_id
  ON public.daily_quest_tasks (daily_quest_template_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_runs_template_id
  ON public.daily_quest_runs (daily_quest_template_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_run_tasks_run_id
  ON public.daily_quest_run_tasks (daily_quest_run_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_run_tasks_template_task_id
  ON public.daily_quest_run_tasks (daily_quest_template_task_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_run_id
  ON public.user_daily_quest_progress (daily_quest_run_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_key_claim_tx_hash
  ON public.user_daily_quest_progress (key_claim_tx_hash);
CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_key_claim_token_id
  ON public.user_daily_quest_progress (key_claim_token_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_task_completions_run_id
  ON public.user_daily_task_completions (daily_quest_run_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_task_completions_run_task_id
  ON public.user_daily_task_completions (daily_quest_run_task_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_verified_tx_user_id
  ON public.daily_quest_verified_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_verified_tx_task_id
  ON public.daily_quest_verified_transactions (task_id);

CREATE TABLE IF NOT EXISTS public.daily_quest_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_template_id uuid NOT NULL REFERENCES public.daily_quest_templates(id),
  run_date date NOT NULL,
  notification_type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(daily_quest_template_id, run_date, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_quest_notifications_template_id
  ON public.daily_quest_notifications (daily_quest_template_id);

-- Triggers to auto-update updated_at columns (reuses existing set_updated_at() function from migration 004)
CREATE TRIGGER trg_update_daily_quest_templates_updated
  BEFORE UPDATE ON public.daily_quest_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_daily_quest_runs_updated
  BEFORE UPDATE ON public.daily_quest_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_user_daily_quest_progress_updated
  BEFORE UPDATE ON public.user_daily_quest_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_user_daily_task_completions_updated
  BEFORE UPDATE ON public.user_daily_task_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS on all new tables (deny-by-default; no broad anon/authenticated policies in v1)
ALTER TABLE public.daily_quest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_run_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_verified_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_notifications ENABLE ROW LEVEL SECURITY;

-- All access (reads and writes) goes through server-side API routes using the service-role
-- admin client, which bypasses RLS. No direct client access is required in v1.
-- NOTE: user_id columns store Privy DIDs (e.g. "did:privy:..."), not Supabase auth.uid()
-- UUIDs, so auth.uid()-based RLS policies cannot match them. If direct client reads are
-- added in a future iteration, use a privy_user_id → auth.uid() mapping table instead.

CREATE OR REPLACE FUNCTION public.register_daily_quest_transaction(
  p_tx_hash TEXT,
  p_chain_id INTEGER,
  p_user_id TEXT,
  p_task_id UUID,
  p_task_type TEXT,
  p_verified_amount TEXT DEFAULT NULL,
  p_event_name TEXT DEFAULT NULL,
  p_block_number BIGINT DEFAULT NULL,
  p_log_index INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing RECORD;
  v_tx_hash_normalized TEXT;
BEGIN
  v_tx_hash_normalized := lower(trim(p_tx_hash));

  -- 1) Check daily quest table first (same-domain idempotency).
  SELECT * INTO v_existing
  FROM public.daily_quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    IF v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for daily quest verification',
      'existing_task_id', v_existing.task_id,
      'existing_task_type', v_existing.task_type
    );
  END IF;

  -- 2) Cross-domain check: reject tx hashes already used for standard quest tasks.
  --    Prevents double-dipping across quest domains (same on-chain action credited twice).
  PERFORM 1 FROM public.quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for standard quest verification'
    );
  END IF;

  INSERT INTO public.daily_quest_verified_transactions (
    transaction_hash,
    chain_id,
    user_id,
    task_id,
    task_type,
    verified_amount,
    event_name,
    block_number,
    log_index
  ) VALUES (
    v_tx_hash_normalized,
    p_chain_id,
    p_user_id,
    p_task_id,
    p_task_type,
    p_verified_amount,
    p_event_name,
    p_block_number,
    p_log_index
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_registered', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.daily_quest_verified_transactions
    WHERE lower(transaction_hash) = v_tx_hash_normalized;

    IF FOUND AND v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for daily quest verification (concurrent)'
    );
END;
$$;

-- SECURITY: this RPC is server-only. Prevent client-side callers from burning tx hashes.
REVOKE EXECUTE ON FUNCTION public.register_daily_quest_transaction(
  TEXT,
  INTEGER,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_daily_quest_transaction(
  TEXT,
  INTEGER,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER
) TO service_role;

-- Cross-domain replay prevention: update the existing register_quest_transaction
-- (from migration 116) to also reject tx hashes already used in daily quests.
-- This prevents a user from completing a daily quest task first, then reusing the
-- same tx hash for a standard quest task.
CREATE OR REPLACE FUNCTION public.register_quest_transaction(
  p_tx_hash TEXT,
  p_chain_id INTEGER,
  p_user_id TEXT,
  p_task_id UUID,
  p_task_type TEXT,
  p_verified_amount TEXT DEFAULT NULL,
  p_event_name TEXT DEFAULT NULL,
  p_block_number BIGINT DEFAULT NULL,
  p_log_index INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing RECORD;
  v_tx_hash_normalized TEXT;
BEGIN
  -- IMPORTANT: preserve lower(trim()) normalization from migration 149.
  v_tx_hash_normalized := lower(trim(p_tx_hash));

  SELECT * INTO v_existing
  FROM public.quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    IF v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification',
      'existing_task_id', v_existing.task_id,
      'existing_task_type', v_existing.task_type
    );
  END IF;

  -- Cross-domain check: reject tx hashes already used for daily quest tasks.
  PERFORM 1 FROM public.daily_quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for daily quest verification'
    );
  END IF;

  INSERT INTO public.quest_verified_transactions (
    transaction_hash,
    chain_id,
    user_id,
    task_id,
    task_type,
    verified_amount,
    event_name,
    block_number,
    log_index
  ) VALUES (
    v_tx_hash_normalized,
    p_chain_id,
    p_user_id,
    p_task_id,
    p_task_type,
    p_verified_amount,
    p_event_name,
    p_block_number,
    p_log_index
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_registered', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.quest_verified_transactions
    WHERE lower(transaction_hash) = v_tx_hash_normalized;

    IF FOUND AND v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification (concurrent)'
    );
END;
$$;
```

## Types Changes or Creation
Extend `lib/supabase/types.ts` with explicit daily quest types.

Append `"daily_checkin"` to `TaskType` and add daily quest domain interfaces. `TaskType` is already aligned with the live `quest_tasks_task_type_check` constraint (migration `150_add_uniswap_swap_task_type.sql`), so no pre-work “drift reconciliation” is required in the current codebase.

Type example:
```ts
import type { TaskType, InputValidationType } from "@/lib/supabase/types";

export interface DailyQuestTemplate {
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
  /**
   * Template completion bonus (admin-defined). Awarded only after a successful daily completion key claim.
   * Not derived from individual task reward_amount fields.
   */
  completion_bonus_reward_amount: number;
  is_active: boolean;
  lock_address?: string | null;
  lock_manager_granted: boolean;
  grant_failure_reason?: string | null;
  /**
   * JSONB stored on daily_quest_templates. Keys use snake_case to match existing task_config conventions.
   * All fields optional and independently combinable.
   */
  eligibility_config: {
    min_vendor_stage?: number;
    requires_gooddollar_verification?: boolean;
    required_lock_address?: string;
    required_erc20?: { token: string; min_balance: string };
  };
  created_at: string;
  updated_at: string;
  daily_quest_tasks?: DailyQuestTask[];
}

export interface DailyQuestTask {
  id: string;
  daily_quest_template_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  verification_method: string;
  reward_amount: number;
  order_index: number;
  task_config?: Record<string, unknown> | null;
  input_required?: boolean;
  input_label?: string;
  input_placeholder?: string;
  input_validation?: InputValidationType;
  requires_admin_review?: boolean;
}
```

Daily uniswap tasks are represented as:
- `task_type = 'uniswap_swap'`
- `task_config.pair` in `ETH_UP | ETH_USDC | UP_USDC` (must match `lib/uniswap/types.ts` `SwapPair`)
- `task_config.direction` in `A_TO_B | B_TO_A`
- `task_config.required_amount_in` as a base-10 integer string in raw token units (same field shape validated and used by standard quest `uniswap_swap` tasks)

Daily check-in tasks are represented as:
- `task_type = 'daily_checkin'`
- `verification_method = 'automatic'` (state-based check, no blockchain tx or user input)
- `input_required = false`
- `requires_admin_review = false`
- `task_config = {}` (no configuration needed; the task verifies whether the user has already checked in today via the existing check-in system)

`daily_checkin` is a daily-quest-only task type. It is added to `TaskType` in `lib/supabase/types.ts` and to the `daily_quest_tasks` CHECK constraint but is **not** added to the `quest_tasks` CHECK constraint (standard quests do not use it). The `quest_tasks_task_type_check` constraint (migration `150_add_uniswap_swap_task_type.sql`) remains unchanged.

Do not introduce daily-only task-type unions in TypeScript. Daily quests use `TaskType` so the verifier registry and UI branching stay shared across standard + daily flows. The daily DB constraint is intentionally **narrower** than `TaskType` in v1 (see migration SQL) so we can ship a complete, server-verifiable feature slice without partial support for account-link/submission tasks. The `DailyQuestTask` interface is intentionally standalone (does not extend `QuestTask`) because `QuestTask` carries `quest_id: string` which does not apply to daily quest tasks.

## API/Service Layer Changes
Admin APIs (App Router, admin-guard enforced):
- `GET /api/admin/daily-quests` list templates + today run metadata.
- `POST /api/admin/daily-quests` create template/tasks (including `lock_address` + lock manager status) and broadcast “created”.
- `GET /api/admin/daily-quests/[dailyQuestId]` template detail.
- `PUT /api/admin/daily-quests/[dailyQuestId]` update template/tasks.
- `PATCH /api/admin/daily-quests/[dailyQuestId]` activate/deactivate.

User APIs (Pages Router for consistency with existing quest player):
- `GET /api/daily-quests` returns active today runs with tasks.
  - Always includes `completion_bonus_reward_amount` (from the template; this is a bonus, not a sum of task rewards).
  - When `authUser.id` is present, also includes `eligibility: DailyQuestEligibility`.
    - Eligibility evaluation must be performed against a **single wallet address** (because vendor stage, ERC20 balance, and tx-based tasks are wallet-specific), but the system must remain consistent with multi-wallet UX:
      1) Prefer the caller’s selected wallet when available: if the request includes `X-Active-Wallet`, validate it against the user’s linked wallets using `extractAndValidateWalletFromHeader({ required: false })`, and use that wallet for eligibility.
      2) Otherwise fall back to the stored primary wallet using `getUserPrimaryWallet(supabase, userId)` from `lib/quests/prerequisite-checker.ts`.
    - Include `eligibility_evaluated_wallet: string | null` in the response for transparency/debugging.
    - Pass the chosen wallet into `evaluateDailyQuestEligibility(...)`.
  - When `authUser.id` is absent, **omit** `eligibility` entirely (do not perform user-specific reads or on-chain checks).
  When `eligibility.eligible: false`, the `start` endpoint must also reject with `403`.
- `GET /api/daily-quests/[runId]` run detail and user completion state.
- `POST /api/daily-quests/[runId]/start` creates idempotent progress row (`on conflict do nothing`) after eligibility check.
- `POST /api/daily-quests/complete-task` verification + completion insert/update.
- `POST /api/daily-quests/claim-task-reward` claim per-task xDG.
- `POST /api/daily-quests/complete-quest` final claim when all tasks complete; grants key on-chain for the template lock and records `key_claim_tx_hash` + `key_claim_token_id`.

Wallet identity handling on user write endpoints:
- **v1 daily quests are wallet-bound** (all supported task types are tx-based or check-in state for a specific wallet). For every user write endpoint (`start`, `complete-task`, `claim-task-reward`, `complete-quest`), require and validate `X-Active-Wallet` with `extractAndValidateWalletFromHeader` (same pattern as `pages/api/quests/complete-task.ts`, but with `required: true`) so multi-wallet users cannot accidentally complete/claim on the wrong wallet.
- For tx-verified tasks (`vendor_*` tx tasks, `deploy_lock`, `uniswap_swap`), verification must be server-authoritative from the receipt and must enforce `receipt.from` matches the validated `X-Active-Wallet` (either directly in the strategy or with an explicit guard in the handler).

Run state validation on all mutating user endpoints:
- Reject writes unless the target run is `status='active'` and `now()` is between `starts_at` and `ends_at`.
- Return `409` with a stable error code (for example `RUN_CLOSED`) when the run is outside its active window.

Daily run ensure logic (called by both admin list and user list reads):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:daily-runs");

export async function ensureTodayDailyRuns(supabase: SupabaseClient) {
  const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const startsAt = `${todayUtc}T00:00:00Z`;
  const endsAt = `${todayUtc}T23:59:59.999Z`;

  // 1) Fetch active templates (runs are created idempotently below).
  const { data: templates, error: templateError } = await supabase
    .from('daily_quest_templates')
    .select('id, title')
    .eq('is_active', true);

  if (templateError) {
    log.warn("daily templates fetch failed", { templateError });
    return;
  }
  if (!templates?.length) return;

  for (const tmpl of templates) {
    // 2) Upsert run row; on conflict do nothing.
    const { error: upsertError } = await supabase
      .from('daily_quest_runs')
      .upsert(
        {
          daily_quest_template_id: tmpl.id,
          run_date: todayUtc,
          starts_at: startsAt,
          ends_at: endsAt,
          status: 'active',
        },
        { onConflict: 'daily_quest_template_id,run_date', ignoreDuplicates: true },
      );

    if (upsertError) {
      log.warn("daily run upsert failed", { templateId: tmpl.id, upsertError });
      continue;
    }

    // Always fetch the run record to get the ID (upsert with ignoreDuplicates returns no row on conflict).
    const { data: runRow, error: runError } = await supabase
      .from('daily_quest_runs')
      .select('id')
      .eq('daily_quest_template_id', tmpl.id)
      .eq('run_date', todayUtc)
      .maybeSingle();

    if (runError || !runRow) {
      log.warn("daily run fetch failed", { templateId: tmpl.id, runError });
      continue;
    }

    // 3) Snapshot template tasks into run tasks idempotently:
    //    - Allows concurrent callers safely (unique(daily_quest_run_id, order_index))
    //    - Backfills if a previous request created the run row but failed before snapshotting tasks
    const { data: tasks, error: taskError } = await supabase
      .from('daily_quest_tasks')
      .select('*')
      .eq('daily_quest_template_id', tmpl.id)
      .order('order_index');

    if (taskError) {
      log.warn("daily template tasks fetch failed", { templateId: tmpl.id, taskError });
      continue;
    }
    if (tasks?.length) {
      const { error: snapshotError } = await supabase.from('daily_quest_run_tasks').upsert(
        tasks.map((t) => ({
          daily_quest_run_id: runRow.id,
          daily_quest_template_task_id: t.id,
          title: t.title,
          description: t.description,
          task_type: t.task_type,
          verification_method: t.verification_method,
          reward_amount: t.reward_amount,
          order_index: t.order_index,
          // daily_quest_run_tasks.task_config is NOT NULL; template tasks may be null.
          task_config: t.task_config ?? {},
          input_required: t.input_required,
          input_label: t.input_label,
          input_placeholder: t.input_placeholder,
          input_validation: t.input_validation,
          requires_admin_review: t.requires_admin_review,
        })),
        { onConflict: 'daily_quest_run_id,order_index', ignoreDuplicates: true },
      );
      if (snapshotError) {
        log.warn("daily run task snapshot failed", { templateId: tmpl.id, runId: runRow.id, snapshotError });
        continue;
      }
    }

    // 4) Send refresh notification (once per template per day).
    await ensureRefreshNotificationSent(supabase, tmpl.id, todayUtc, tmpl.title);
  }
}
```

Race-safety notes:
- The `upsert ... ignoreDuplicates: true` on `(daily_quest_template_id, run_date)` ensures only one run per template per day.
- The run-task snapshot upsert on `(daily_quest_run_id, order_index)` prevents duplicate task rows from concurrent callers.
- Never mutate run tasks after snapshot creation.

Notification behavior:
- On template creation (`is_active=true`): call `broadcastTelegramNotification` with the same signature used in existing admin quest APIs:
  - `broadcastTelegramNotification(supabase, "New daily quest available!", \`"${title}" is now live — complete it before UTC reset.\`, "/lobby/quests", "daily_quest_created")`
- Also on template creation: insert a `daily_quest_notifications` dedupe row for **today** with `notification_type='daily_quest_refresh'` so the first `ensureTodayDailyRuns()` call on the same day does not send a redundant refresh broadcast.
  - This is a server-only insert and must ignore unique conflicts:
    ```ts
    const { error: dedupeErr } = await supabase
      .from("daily_quest_notifications")
      .insert({
        daily_quest_template_id: templateId,
        run_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (UTC)
        notification_type: "daily_quest_refresh",
      });
    if (dedupeErr && dedupeErr.code !== "23505") throw dedupeErr;
    ```
- On new day first materialization per template: send refresh notification once using insert-first dedupe:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { broadcastTelegramNotification } from "@/lib/notifications/telegram";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:daily-runs");

export async function ensureRefreshNotificationSent(
  supabase: SupabaseClient,
  templateId: string,
  runDateUtc: string,
  templateTitle: string
) {
  // 1. Insert dedupe row
  const { data: dedupeRow, error } = await supabase
    .from('daily_quest_notifications')
    .insert({
      daily_quest_template_id: templateId,
      run_date: runDateUtc,
      notification_type: 'daily_quest_refresh'
    })
    .select('id')
    .maybeSingle();

  if (error && error.code !== '23505') { // Ignore unique_violation
    log.warn("daily quest refresh dedupe insert failed", { templateId, runDateUtc, error });
  }

  // 2. Only broadcast if we successfully inserted the dedupe row
  if (dedupeRow) {
    // Fire-and-forget to avoid blocking read endpoints (broadcast can take minutes on large user bases).
    broadcastTelegramNotification(
      supabase,
      "Daily quest refreshed",
      `"${templateTitle}" is now available for today.`,
      "/lobby/quests",
      "daily_quest_refresh",
    ).catch((e) =>
      log.warn("daily quest refresh broadcast failed", { templateId, runDateUtc, error: e }),
    );
  }
}
```

- Add `daily_quest_created` and `daily_quest_refresh` to the `TYPE_EMOJI` map in `lib/notifications/telegram.ts`. Current map keys: `task_completed`, `milestone_completed`, `enrollment_created`, `enrollment_status`, `application_status`, `task_reviewed`, `quest_created`. Unrecognized types fall back to a bell emoji, which is acceptable, but explicit entries are preferred.

Daily check-in verification behavior:
- `daily_checkin` is a state-based task type (like `vendor_level_up`). No transaction hash, no user input, no admin review.
- Verification reuses the existing `DailyCheckinService.canCheckinToday(walletAddress)` from `lib/checkin` (specifically `getDefaultCheckinService()` from `lib/checkin/index.ts`). This method calls the `has_checked_in_today_v2` Supabase RPC under the hood, which is the same check used by the check-in API (`pages/api/checkin/index.ts`) and the `useDailyCheckin` hook.
- `canCheckinToday` returns `true` if the user has **not** checked in yet today, `false` if they have. The verification strategy inverts this: if `canCheckinToday` returns `false`, the user has checked in and the task is verified.
- The strategy requires the user's wallet address (from `X-Active-Wallet` header validation, same as other daily quest task completions).
- Register `daily_checkin` in `lib/quests/verification/registry.ts` mapped to `DailyCheckinVerificationStrategy`.
- Update `lib/quests/taskVerificationMethod.ts` so `resolveTaskVerificationMethod` maps `daily_checkin` to `"automatic"`.

Concrete `DailyCheckinVerificationStrategy` implementation (add to `lib/quests/verification/daily-checkin-verification.ts`):

Note: `getDefaultCheckinService()` uses the anon Supabase client from `lib/supabase` internally. The `has_checked_in_today_v2` RPC is called with a wallet address (no RLS user context required), so the anon client is sufficient for this read-only check. `canCheckinToday` throws a `CheckinError` (not a plain `Error`) when the RPC fails — the catch block must handle this uniformly regardless of error type.

```ts
import type { VerificationStrategy, VerificationResult, VerificationOptions } from "./types";
import type { TaskType } from "@/lib/supabase/types";
import { getDefaultCheckinService } from "@/lib/checkin";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:verification:daily-checkin");

export class DailyCheckinVerificationStrategy implements VerificationStrategy {
  async verify(
    taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    options?: VerificationOptions,
  ): Promise<VerificationResult> {
    if (!userAddress) {
      return { success: false, error: "Wallet address is required", code: "WALLET_REQUIRED" };
    }

    try {
      const checkinService = getDefaultCheckinService();
      const canStillCheckin = await checkinService.canCheckinToday(userAddress);

      if (canStillCheckin) {
        // User has NOT checked in yet today
        return {
          success: false,
          error: "You must complete your daily check-in first",
          code: "CHECKIN_NOT_FOUND",
        };
      }

      // User HAS checked in today — task is verified
      return { success: true };
    } catch (error: unknown) {
      // canCheckinToday throws CheckinError on RPC failure; treat all thrown errors uniformly.
      log.error("Daily checkin verification failed", {
        userId,
        userAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: "Failed to verify daily check-in status",
        code: "CHECKIN_VERIFICATION_ERROR",
      };
    }
  }
}
```

Update `lib/quests/taskVerificationMethod.ts` — add the `daily_checkin` branch; preserve the existing `uniswap_swap` branch:
```ts
export function resolveTaskVerificationMethod(
  task: TaskVerificationInput,
): string | undefined {
  if (task.task_type === "deploy_lock") {
    return "blockchain";
  }
  if (task.task_type === "uniswap_swap") {
    return "blockchain";
  }
  if (task.task_type === "daily_checkin") {
    return "automatic";
  }
  return task.verification_method ?? undefined;
}
```

Registry addition in `lib/quests/verification/registry.ts` — the registry uses a `Partial<Record<TaskType, VerificationStrategy>>` map (not a switch statement). The file creates a shared `publicClient` via `createViemPublicClient()` from `lib/blockchain/providers/privy-viem` and passes it to strategies that need on-chain reads. `DailyCheckinVerificationStrategy` is stateless (no constructor dependencies), so it does not need the client. Add the import and singleton entry alongside the existing ones:
```ts
import { DailyCheckinVerificationStrategy } from "./daily-checkin-verification";

// Add below existing singleton instantiations (vendorStrategy, deployLockStrategy, aiStrategy, uniswapStrategy):
const dailyCheckinStrategy = new DailyCheckinVerificationStrategy();

// Add to the strategies map (existing entries preserved; only the new line is added):
const strategies: Partial<Record<TaskType, VerificationStrategy>> = {
  vendor_buy: vendorStrategy,
  vendor_sell: vendorStrategy,
  vendor_light_up: vendorStrategy,
  vendor_level_up: vendorStrategy,
  deploy_lock: deployLockStrategy,
  submit_proof: aiStrategy,
  uniswap_swap: uniswapStrategy,
  daily_checkin: dailyCheckinStrategy, // NEW
};
```

The `daily_checkin` strategy is stateless (no constructor dependencies, no shared client). A singleton instance is used here for consistency with the other strategies in the registry.

`daily_checkin` is not a tx-based task. It must **not** be added to `isTxHashRequiredTaskType` (from `lib/quests/vendorTaskTypes.ts`) and must not trigger replay-prevention registration. The `complete-task` handler should skip the `isTxBasedTask` branch for `daily_checkin` tasks (it already will, since `isVendorTxTaskType` and the `deploy_lock`/`uniswap_swap` checks won't match).

Uniswap verification behavior:
- Reuse existing constants/ABIs already in repo (`lib/uniswap/constants.ts`, `lib/uniswap/abi/*`); do not add new ABI packages.
- Accept only configured Base router/contracts and only configured pairs from `UNISWAP_ADDRESSES`.
- Verify server-side from tx receipt logs; never trust pair/direction/amount from client payload.

## UI Changes
User side:
- `pages/lobby/quests/index.tsx`: add tabs `Quests` and `Daily Quests`.
- `Daily Quests` tab uses `useDailyQuests` + `DailyQuestList`.
- Cards must clearly show reset window (`Resets daily at 00:00 UTC`).
- Cards and detail must show the template completion bonus amount (when > 0): `"Completion Bonus: {completion_bonus_reward_amount} xDG"`.
- `DailyQuestCard` links to the run detail page: `href={\`/lobby/quests/daily/${run.id}\`}`.

**Eligibility display on daily quest cards and detail page:**
The user-facing API (`GET /api/daily-quests`) follows the same enrichment posture as `pages/api/quests/index.ts`:
- When authenticated (`authUser.id` present): include `eligibility: DailyQuestEligibility` per quest.
- When unauthenticated: omit `eligibility` entirely and do not perform any user-specific reads or on-chain checks.

When present, the evaluator (`lib/quests/daily-quests/constraints.ts`) returns:
```ts
type DailyQuestEligibility = {
  eligible: boolean;
  /** Which constraints failed — empty when eligible */
  failures: Array<{
    type:
      | "wallet_required"
      | "vendor_stage"
      | "gooddollar_verification"
      | "lock_key"
      | "erc20_balance";
    message: string; // human-readable, e.g. "Requires Hustler level or higher"
  }>;
};
```
- `wallet_required` failure message: `"Wallet is required to participate"` (shown when a wallet-bound constraint is configured but the server cannot resolve a wallet address for eligibility evaluation).
- `vendor_stage` failure message: `"Requires {getStageLabel(min_vendor_stage)} level or higher"` (e.g. "Requires Hustler level or higher"). Uses `getStageLabel()` from `lib/blockchain/shared/vendor-constants.ts`.
- `vendor_stage` alternate failure message (misconfiguration or RPC failure): `"Vendor level check unavailable"`.
- `gooddollar_verification` failure message: `"GoodDollar face verification required"`.
- `lock_key` failure message: `"Requires a key from a specific lock"`.
- `erc20_balance` failure message: `"Insufficient token balance"`.

**Card rendering (`DailyQuestCard`):**
- When `eligible: false`, render requirement badges in the card header (same positioning and style as `quest-card.tsx` badges: `bg-gray-800/80 backdrop-blur-sm border border-gray-600 text-gray-300 px-3 py-1 rounded-full text-sm font-semibold`).
- Show one badge per failure type. Examples: `"Wallet Required"`, `"Hustler Required"`, `"GoodDollar Verification Required"`, `"Key Required"`, `"Token Balance Required"`.
- The "Start" button is disabled when ineligible, with `disabled:opacity-75 disabled:cursor-not-allowed`.
- When `eligibility` is omitted (unauthenticated reads), do not render eligibility badges. The "Start" CTA should follow the existing quests pattern in `hooks/useQuests.ts`: if `!authenticated`, show `toast.error("Please connect your wallet first")` and do not call any write endpoints.

**Detail page rendering (`DailyQuestDetail`):**
- When ineligible, show a yellow warning banner (same pattern as quest detail: `bg-yellow-900/20 border border-yellow-700/60 text-yellow-100 rounded-lg p-4`) listing all unmet requirements with their human-readable messages.
- For `gooddollar_verification`, include a link to `/lobby#gooddollar-verification` (same as existing quest detail pattern in `QuestHeader.tsx` lines 122-132).
- For `vendor_stage`, display the required stage label and the user's current stage if available (passed back from the evaluator as optional metadata).
- When `eligibility` is omitted (unauthenticated reads), do not render the ineligibility banner; render only static quest content and gate write actions using the same `!authenticated` check/toast behavior as `hooks/useQuests.ts`.

Frontend multi-wallet consistency requirement:
- `useDailyQuests` must send `X-Active-Wallet: selectedWallet.address` on **both** reads (`GET /api/daily-quests`, `GET /api/daily-quests/[runId]`) and writes, so the eligibility shown in UI matches the wallet that will be used for completion/claims.
- Server-side, `X-Active-Wallet` is always validated against the user’s linked wallets via `extractAndValidateWalletFromHeader` (it is not trusted as an arbitrary address).

**Daily quest run detail page (`pages/lobby/quests/daily/[runId].tsx`):**
- Route param is `runId` (UUID from `daily_quest_runs.id`).
- Fetches run data from `GET /api/daily-quests/[runId]`:
  - When authenticated, include `X-Active-Wallet` header on the request (same as list).
  - When unauthenticated, do not send `X-Active-Wallet` and render a connect/auth gated experience.
- Page layout mirrors `pages/lobby/quests/[id].tsx`:
  - Back link to `/lobby/quests` (Daily Quests tab stays selected via query param or local tab state).
  - Header: title, description, image, reset messaging, completion bonus display.
  - If `eligibility` is present and `eligible: false`, show the ineligibility banner and disable task actions + start.
  - Start CTA:
    - If no progress row exists, show `Button` `"Start Daily Quest"` that calls `POST /api/daily-quests/[runId]/start` with `X-Active-Wallet`.
    - If progress exists, hide start CTA and show `"In Progress"` state.
  - Task list rendering:
    - Render tasks from `daily_quest_run_tasks` ordered by `order_index`.
    - For task types supported by the existing quest UI component (`vendor_buy`, `vendor_sell`, `vendor_light_up`, `vendor_level_up`, `deploy_lock`, `uniswap_swap`), reuse `components/quests/TaskItem.tsx` by adapting the server response into the props it expects:
      - `task` maps from run task fields (`id`, `title`, `description`, `task_type`, `reward_amount`, `order_index`, `task_config`, etc.).
      - `completion` maps from `user_daily_task_completions` row for that run task.
      - `isQuestStarted` maps to “progress row exists”.
      - `questId` prop is not meaningful for daily quests; pass the run ID string so deploy-lock form callbacks still have a stable identifier (TaskItem only uses it for DeployLockTaskForm fallback API call, which is disabled by providing an explicit `onSubmit` callback below).
      - `onAction` implementation mirrors `pages/lobby/quests/[id].tsx#handleTaskAction`, but targets daily endpoints and uses run task IDs:
        - For tx-based tasks: require a valid `transactionHash` and call `POST /api/daily-quests/complete-task` with `{ dailyQuestRunId: runId, dailyQuestRunTaskId: task.id, verificationData: { transactionHash } }`.
        - For `vendor_level_up`: call `POST /api/daily-quests/complete-task` with `{ dailyQuestRunId: runId, dailyQuestRunTaskId: task.id, verificationData: {} }`.
        - For `deploy_lock` tasks that render `DeployLockTaskForm`: always pass `onSubmit` so the form posts to the daily endpoint instead of the default `/api/quests/complete-task`.
      - `onClaimReward` calls `POST /api/daily-quests/claim-task-reward` with `{ completionId }` (and `X-Active-Wallet` header). Since v1 daily claims do not use attestations, there is no signature flow and no EAS Scan link.
    - For `daily_checkin` tasks, render a custom task row (do not use `TaskItem`):
      - Show a `"Verify"` button (disabled unless started and eligible).
      - On click, call `POST /api/daily-quests/complete-task` with `{ dailyQuestRunId: runId, dailyQuestRunTaskId: task.id, verificationData: {} }`.
      - On `CHECKIN_NOT_FOUND`, render the returned error message and a link to `/lobby` (where the existing check-in strip is displayed).
  - Per-task claim UX:
    - For completed tasks with `reward_claimed=false`, show a `"Claim Reward"` button (reuse the TaskItem claim CTA style) that triggers the claim endpoint.
    - Disable claim button while request is in-flight; handle 409 (already claimed) by refetching state.
  - Final claim CTA (key grant):
    - When all run tasks are completed (completion count equals total task count) and `template.lock_address` exists, show `"Claim Daily Completion Key"` button.
    - On click, call `POST /api/daily-quests/complete-quest` with `{ dailyQuestRunId: runId }` (and `X-Active-Wallet` header).
    - If `reward_claimed=true`, render `"Key Claimed"` state and show `key_claim_tx_hash` + `key_claim_token_id` when available.
    - If completion bonus is configured and `completion_bonus_claimed=true`, render `"Completion bonus awarded: {completion_bonus_amount} xDG"`.

Admin side:
- `pages/admin/quests/index.tsx`: tabbed lists for standard quests and daily quests.
- `pages/admin/quests/new.tsx`: tabbed create flow; daily tab loads `DailyQuestForm`.
- Also add explicit Daily Quest routes for clarity and minimal coupling to the existing quest routes:
  - `pages/admin/quests/daily/new.tsx` renders `DailyQuestForm` (create).
  - `pages/admin/quests/daily/[dailyQuestId]/edit.tsx` renders `DailyQuestForm` (edit).
- `DailyQuestForm` includes lock configuration UX aligned with `QuestForm`:
  - manual `lock_address` input
  - optional auto lock deployment flow (reuse existing deployment helper patterns)
  - lock manager grant-state fields (`lock_manager_granted`, `grant_failure_reason`)
- `DailyQuestForm` includes a **Completion Bonus Reward** section:
  - **Completion Bonus (xDG)** — numeric input persisted to `daily_quest_templates.completion_bonus_reward_amount` (integer, >= 0).
  - This bonus is awarded only after a successful daily completion key claim (`POST /api/daily-quests/complete-quest`) and is **not** derived from the per-task `reward_amount` values.
- `DailyQuestForm` includes an **Eligibility Requirements** section for `eligibility_config`:
  - **Minimum Vendor Level** — `<Select>` dropdown populated by `getStageOptions()` from `lib/blockchain/shared/vendor-constants.ts` (returns `[{value:0,label:"Pleb"},{value:1,label:"Hustler"},{value:2,label:"OG"}]`). Default: empty/none (no vendor gate). When a stage is selected, persist `eligibility_config.min_vendor_stage` as the numeric value (0, 1, or 2). Display the human-readable label via `getStageLabel()` in read-only views.
  - **GoodDollar Verification** — `<Toggle>` switch. When enabled, sets `eligibility_config.requires_gooddollar_verification: true`.
  - **Required Lock Key** — text input for a lock contract address (`eligibility_config.required_lock_address`). Optional. When set, the user must hold a valid key from this lock to participate.
- **Required ERC20 Balance** — collapsible sub-section with two fields: token contract address (`eligibility_config.required_erc20.token`) and minimum balance (`eligibility_config.required_erc20.min_balance` as a human decimal string, e.g. `"0.02"`). Optional. Both fields required if either is set.
  - Validation (admin UI + API): `required_erc20.min_balance` is a **human decimal string** (examples: `"0.02"`, `"1"`, `"10.5"`). Reject invalid values at save-time (400 with a clear message):
    - Must match `/^[0-9]+(\\.[0-9]+)?$/`
    - Must be `> 0`
    - Must not have more fractional digits than the token’s `decimals()` value (validated server-side during save by reading `decimals()` from the token contract using `ERC20_ABI`).
  - All four fields are optional and independently combinable. The evaluator in `lib/quests/daily-quests/constraints.ts` checks each configured constraint; all configured constraints must pass for the user to be eligible.
- `DailyQuestTaskForm` mirrors `QuestTaskForm` patterns, including vendor task configs, uniswap pair task config fields, and the `daily_checkin` option.
  - `daily_checkin` task option: label "Daily Check-in", description "Verify the user has completed their daily GM check-in today". When selected, auto-set `verification_method: "automatic"`, `input_required: false`, `requires_admin_review: false`, `task_config: {}`. No additional config fields needed (no pair/direction/amount selectors). This follows the same auto-set pattern used for vendor/blockchain task types in `QuestTaskForm` (line 194-252).

UI constraints:
- Keep existing components functional; daily components are additive.
- Reuse existing style tokens/components (`Button`, `Badge`, `Toggle`, `Select`, `AdminListPageLayout`).

**Daily quest admin list + form controls (must be present):**
- `DailyQuestList`:
  - Primary CTA: `"Create Daily Quest"` → routes to `pages/admin/quests/daily/new.tsx`.
  - Per template row actions:
    - `"Edit"` → routes to `pages/admin/quests/daily/[dailyQuestId]/edit.tsx`.
    - `"Activate"` / `"Deactivate"` toggle button wired to `PATCH /api/admin/daily-quests/[dailyQuestId]`.
  - Show lock status (`lock_address` present, `lock_manager_granted`, `grant_failure_reason` when false) and completion bonus amount.
- `DailyQuestForm`:
  - Buttons: `"Save"` (create/update), `"Cancel"` (route back to admin daily list tab), `"Add Task"` (appends new task with next `order_index`), per-task `"Remove"`, `"Move Up"`, `"Move Down"`.
  - Save-time validations (client + server):
    - `title` non-empty
    - `description` non-empty
    - at least 1 task
    - task `order_index` unique within the template
    - `completion_bonus_reward_amount` integer `>= 0`
    - eligibility fields validated as specified (addresses well-formed; ERC20 min balance format validated via decimals)

## Step-by-Step Implementation Tasks
1. Add DB migration `151_daily_quests.sql`:
- Create all daily tables, indexes, and constraints (full SQL in Data Model Changes section above).
- Include lock/key-claim + completion-bonus columns:
  - `daily_quest_templates.completion_bonus_reward_amount`
  - `daily_quest_templates.lock_address`, `lock_manager_granted`, `grant_failure_reason`
  - `user_daily_quest_progress.key_claim_tx_hash`, `key_claim_token_id` + indexes
  - `user_daily_quest_progress.completion_bonus_claimed`, `completion_bonus_amount`, `completion_bonus_claimed_at`
- Add FK covering indexes for all foreign key columns (required per CLAUDE.md; already included in Data Model Changes SQL).
- Add enum/check constraints for allowed daily task types.
- Add `updated_at` triggers for `daily_quest_templates`, `daily_quest_runs`, `user_daily_quest_progress`, and `user_daily_task_completions` using the existing `set_updated_at()` trigger function (defined in migration `004_unlock_integration.sql`). Included in Data Model Changes SQL.
- Add explicit RLS posture (included in Data Model Changes SQL):
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all new tables.
  - Keep client access denied by default (no broad `anon`/`authenticated` policies).
  - Do not add `auth.uid()`-based SELECT policies: `user_id` columns store Privy DIDs (e.g. `did:privy:…`), not Supabase auth UUIDs, so `auth.uid()` comparisons would never match. All data access goes through service-role API routes. If direct client reads become necessary in a future iteration, a privy_user_id → auth.uid() mapping will be required.
- Add `register_daily_quest_transaction` SQL function (included in Data Model Changes SQL). The function must be `SECURITY DEFINER` with `SET search_path = 'public'` per project security guidelines (see CLAUDE.md).
- Ensure function execute privileges are server-only (included in the SQL above): `REVOKE EXECUTE ... FROM PUBLIC; GRANT EXECUTE ... TO service_role`.
- Harden the existing `award_xp_to_user` RPC (introduced by migration `075_add_award_xp_to_user_function.sql`) so it is also server-only, because it is `SECURITY DEFINER` and bypasses RLS:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.award_xp_to_user(uuid, integer, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.award_xp_to_user(uuid, integer, text, jsonb) TO service_role;
  ```

2. Add type support in `lib/supabase/types.ts`:
- Daily template/task/run/progress/completion interfaces.
- Append `"daily_checkin"` to `TaskType`. This is a daily-quest-only task type; it is not added to the `quest_tasks` DB constraint.
- Do not add a separate `DailyTaskType` union. Reuse `TaskType` directly for daily tasks. `TaskType` already includes `uniswap_swap` in the current codebase.

3. Add verification layer support:
- `UniswapVerificationStrategy` already exists in `lib/quests/verification/uniswap-verification.ts` and is already registered for `uniswap_swap` in `lib/quests/verification/registry.ts`. Daily quests consume the existing strategy; they do not create a second daily-only verifier.
- Create `lib/quests/verification/daily-checkin-verification.ts` with `DailyCheckinVerificationStrategy` and register `daily_checkin` in `verification/registry.ts`. Update `resolveTaskVerificationMethod` to map `daily_checkin` to `"automatic"`.
- Reuse replay-prevention pattern via `daily_quest_verified_transactions` + a new `registerDailyQuestTransaction` wrapper in `lib/quests/daily-quests/replay-prevention.ts` (analogous to `registerQuestTransaction` in `lib/quests/verification/replay-prevention.ts`) that calls the `register_daily_quest_transaction` SQL function. `registerDailyQuestTransaction` must accept an optional `chainId` parameter and pass it through to `p_chain_id`, defaulting to `CHAIN_ID` from `lib/blockchain/config`. Concrete implementation:

```ts
// lib/quests/daily-quests/replay-prevention.ts
import { CHAIN_ID } from "@/lib/blockchain/config";
import { normalizeTransactionHash } from "@/lib/quests/txHash";
import { getLogger } from "@/lib/utils/logger";
import type { QuestTransactionMetadata } from "@/lib/quests/verification/replay-prevention";

const log = getLogger("quests:daily:replay-prevention");

export async function registerDailyQuestTransaction(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createAdminClient>,
  params: {
    txHash: string;
    userId: string;
    taskId: string;
    taskType: string;
    chainId?: number;
    metadata?: QuestTransactionMetadata;
  },
): Promise<{
  success: boolean;
  error?: string;
  kind?: "conflict" | "rpc_error";
  alreadyRegistered?: boolean;
}> {
  const normalizedTxHash = normalizeTransactionHash(params.txHash);
  const metadata = params.metadata || {};
  const blockNumber =
    typeof metadata.blockNumber === "string"
      ? Number(metadata.blockNumber)
      : typeof metadata.blockNumber === "number"
        ? metadata.blockNumber
        : null;

  const { data, error } = await supabase.rpc("register_daily_quest_transaction", {
    p_tx_hash: normalizedTxHash,
    p_chain_id: params.chainId ?? CHAIN_ID,
    p_user_id: params.userId,
    p_task_id: params.taskId,
    p_task_type: params.taskType,
    p_verified_amount: metadata.amount ?? null,
    p_event_name: metadata.eventName ?? null,
    p_block_number:
      typeof blockNumber === "number" && Number.isFinite(blockNumber)
        ? blockNumber
        : null,
    p_log_index:
      typeof metadata.logIndex === "number" ? metadata.logIndex : null,
  });

  if (error) {
    log.error("register_daily_quest_transaction failed", {
      error,
      txHash: normalizedTxHash,
    });
    return { success: false, error: error.message, kind: "rpc_error" };
  }

  if (data?.success === false) {
    return { success: false, error: data?.error, kind: "conflict" };
  }

  return {
    success: true,
    alreadyRegistered: data?.already_registered === true,
  };
}
```

- Reuse `normalizeTransactionHash` from `lib/quests/txHash.ts` and the existing response contract from `lib/quests/verification/replay-prevention.ts`.

4. Build daily run orchestration helper:
- `lib/quests/daily-quests/runs.ts` with `ensureTodayDailyRuns` and `ensureRefreshNotificationSent`.
- UTC-only day boundary.

5. Build eligibility evaluator:
- `lib/quests/daily-quests/constraints.ts` exports `evaluateDailyQuestEligibility(supabase, userId, walletAddress, eligibilityConfig)` returning `DailyQuestEligibility` (see UI Changes section for type definition).
- The function evaluates each configured constraint independently and collects all failures. All configured constraints must pass for `eligible: true`.
- Reuse existing prerequisite checking patterns and provider utilities:
  - GoodDollar face verification: reuse `lib/quests/prerequisite-checker.ts#checkQuestPrerequisites` by mapping `eligibility_config.requires_gooddollar_verification` into `requires_gooddollar_verification`. On failure, push `{ type: "gooddollar_verification", message: "GoodDollar face verification required" }`.
  - Wallet precondition (for wallet-bound constraints): if `eligibility_config.min_vendor_stage` is set **or** `eligibility_config.required_erc20` is set, and `walletAddress` is null/empty, push `{ type: "wallet_required", message: "Wallet is required to participate" }` and skip the vendor/ERC20 reads. (These constraints are wallet-specific.)
  - Lock key ownership (linked-wallet pattern; consistent with existing quests prerequisite checks):
    - Use `checkUserKeyOwnership(publicClient, userId, required_lock_address)` from `lib/services/user-key-service.ts` (this checks **all linked wallets**).
    - If **no** linked wallet has a valid key: push `{ type: "lock_key", message: "Requires a key from a specific lock" }`.
    - If any linked wallet has the key, the constraint passes (do not require it to be the selected `X-Active-Wallet`).
  - Vendor stage gating: reuse the existing vendor contract read approach from `lib/quests/verification/vendor-verification.ts` (`DG_TOKEN_VENDOR_ABI.getUserState`) using `createPublicClientUnified()` from `lib/blockchain/config/clients/public-client` (server-safe). Compare `stage >= eligibilityConfig.min_vendor_stage`. On failure, push `{ type: "vendor_stage", message: "Requires {getStageLabel(min_vendor_stage)} level or higher" }` using `getStageLabel()` from `lib/blockchain/shared/vendor-constants.ts`.
    - If the vendor contract address is not configured (missing `NEXT_PUBLIC_DG_VENDOR_ADDRESS`) or the on-chain read fails, fail closed with `{ type: "vendor_stage", message: "Vendor level check unavailable" }` and log the underlying error/config issue server-side.
  - ERC20 balance gating: reuse `ERC20_ABI` from `lib/blockchain/shared/abi-definitions.ts` and `createPublicClientUnified()` to call `balanceOf(userWallet)`; compare against `min_balance` parsed as `bigint` in raw token units. On failure, push `{ type: "erc20_balance", message: "Insufficient token balance" }`.
    - Convert `required_erc20.min_balance` (human decimal string) into raw units by reading `decimals()` from the token contract (via `ERC20_ABI`) and using `parseUnits`. If parsing fails or `decimals()` read fails, fail closed with `{ type: "erc20_balance", message: "Insufficient token balance" }` (and log a config error server-side).
- The user-facing list API (`GET /api/daily-quests`) calls `evaluateDailyQuestEligibility` for each active template and attaches the result to the response, mirroring how `pages/api/quests/index.ts` enriches quests with `can_start` and `prerequisite_state`.

6. Implement admin route handlers:
- CRUD for template + task collections.
- Validate task config with one shared validator path (vendor + deploy_lock + uniswap). Do not split identical checks across admin APIs.
- Send Telegram broadcast on template create only; refresh broadcast is emitted from `ensureRefreshNotificationSent` in run orchestration.
- For writes (`POST/PUT/PATCH`), enforce `X-Active-Wallet` wallet ownership validation using the same admin session flow as existing admin routes.
- Persist lock lifecycle fields on template writes: `lock_address`, `lock_manager_granted`, `grant_failure_reason`.
- On create/edit UI flow, reuse the same lock deployment pattern as `QuestForm` (server wallet deployment + manager assignment), then persist the resulting `lock_address` and grant-state fields to the daily template.
- On update, allow template task edits but do not mutate existing `daily_quest_run_tasks` snapshots; edits apply to future runs only.
- If a request explicitly targets the current day run (if such endpoint is added later), reject with `409 RUN_IMMUTABLE`.

7. Implement user daily quest APIs:
- List/detail/progress/task completion/claim/final completion.
- Ensure unique per-day completion at DB level.
- Make `complete-task` transaction-safe:
  - Resolve task identity from `daily_quest_run_tasks.id` (not template task id) so run behavior stays immutable.
  - `insert ... on conflict do nothing returning id` into `user_daily_task_completions`.
  - Recompute completion count from `user_daily_task_completions` for `(user_id, daily_quest_run_id)` and persist `completed_at` when count equals total task count.
  - Never increment a cached `tasks_completed` counter to avoid double-count races.
- Make claim endpoints idempotent and race-safe:
  - Task claim condition with atomic XP update:

`award_xp_to_user` takes `p_user_id uuid` — this is `user_profiles.id` (a UUID), not the Privy string `userId`. Fetch the profile UUID before the claim block.

```ts
// Resolve user_profiles.id (uuid) required by award_xp_to_user RPC.
const { data: profile, error: profileError } = await supabase
  .from('user_profiles')
  .select('id')
  .eq('privy_user_id', userId)
  .maybeSingle();

if (profileError || !profile) {
  log.error('Failed to resolve user profile for XP award', { userId, profileError });
  return res.status(500).json({ error: 'User profile not found' });
}
const userProfileUuid = profile.id; // uuid

const { data: updatedTask, error: updateError } = await supabase
  .from('user_daily_task_completions')
  .update({ reward_claimed: true })
  .eq('id', completionId)
  .eq('user_id', userId)
  .eq('submission_status', 'completed')
  .eq('reward_claimed', false)
  .select('id')
  .maybeSingle();

if (updateError || !updatedTask) {
  // Already claimed or not found
  return res.status(409).json({ error: 'Reward already claimed, completion not found, or task not completed.' });
}

// XP increment gated behind the conditional returning result.
const { error: xpError } = await supabase.rpc('award_xp_to_user', {
  p_user_id: userProfileUuid, // uuid from user_profiles.id, NOT the privy string userId
  p_xp_amount: rewardAmount,
  p_activity_type: 'daily_quest_task_reward_claimed',
  p_activity_data: {
    daily_quest_run_id: dailyQuestRunId,
    daily_quest_run_task_id: dailyQuestRunTaskId,
    completion_id: completionId,
  },
});

if (xpError) {
  // Compensating rollback so failed XP writes do not permanently burn claimability.
  await supabase
    .from('user_daily_task_completions')
    .update({ reward_claimed: false })
    .eq('id', completionId)
    .eq('user_id', userId);

  return res.status(503).json({
    error: 'XP_AWARD_FAILED',
    message: 'Reward claim was not finalized. Please retry.',
  });
}
```
  - Final claim (`/api/daily-quests/complete-quest`): grants the daily completion key on-chain, then awards the template completion bonus XP (if configured):
    - Load run/template and require `template.lock_address` exists.
    - Validate all tasks for `(user_id, daily_quest_run_id)` are completed.
    - Enforce idempotency:
      - If `user_daily_quest_progress.reward_claimed = true`, **do not** grant another key.
      - If `reward_claimed = true` but `completion_bonus_claimed = false`, run the **bonus-only** award path (below) so bonus can be retried without re-granting the key.
    - Grant key on-chain using:
      - `createWalletClientUnified()`
      - `createPublicClientUnified()`
      - `grantKeyToUser(walletClient, publicClient, userId, template.lock_address)`
      - `grantKeyToUser` in `lib/services/user-key-service.ts` already calls `getKeyManagersForContext(targetWallet, 'milestone')` internally. This is correct for daily quests (earned access; key managed by admin). Do not bypass this function or pass `keyManagers` directly.
    - Extract tokenId from the grant receipt. `grantKeyToUser` returns `UserKeyGrantResult { success, transactionHash, error }` — it does NOT return the tokenId. The caller must separately fetch the receipt and call `extractTokenTransfers(receipt)` from `lib/blockchain/shared/transaction-utils` (same pattern as `pages/api/quests/complete-quest.ts` lines 156-186). Note: `grantKeyToUser` already waits for 2 confirmations internally, so the second `waitForTransactionReceipt` call (with `confirmations: 1`) will return immediately since the tx is already confirmed. Wrap tokenId extraction in try-catch; log a warning on failure but do not fail the response (tokenId is best-effort metadata, not critical for claim success).
    - Atomically mark progress as claimed and store grant metadata:
      - `reward_claimed = true`
      - `key_claim_tx_hash = <tx hash>`
      - `key_claim_token_id = <token id or null>`
      - Do **not** overwrite `completed_at` here. `completed_at` is reserved for “all tasks completed” and is set by `complete-task` when the user completes the last task. Final claim uses `reward_claimed` and `key_claim_*` fields to represent claim state/time.
    - Award the template completion bonus XP **after** the key is granted, gated by `completion_bonus_claimed`:
      - If `template.completion_bonus_reward_amount <= 0`, skip bonus award entirely.
      - Otherwise, claim-gate with a conditional update on `user_daily_quest_progress` so XP can only be awarded once.
      - If the XP award RPC fails, rollback `completion_bonus_claimed=false` so the user can retry safely without triggering another on-chain key grant.
    - Response payload should include `transactionHash`, `keyTokenId`, `completionBonusRewardAmount`, `completionBonusAwarded`, and `attestationRequired` parity flag if EAS proof commit is introduced later.

Concrete bonus award implementation (inside `pages/api/daily-quests/complete-quest.ts` after you have `progress`, `template`, `transactionHash`, `keyTokenId`, and `dailyQuestRunId`):
```ts
const bonusAmount = Number(template.completion_bonus_reward_amount || 0);
let completionBonusAwarded = false;

if (bonusAmount > 0) {
  // 1) Claim-gate at the DB layer so award_xp_to_user runs at most once.
  const nowIso = new Date().toISOString();
  const { data: bonusGate, error: bonusGateErr } = await supabase
    .from("user_daily_quest_progress")
    .update({
      completion_bonus_claimed: true,
      completion_bonus_amount: bonusAmount,
      completion_bonus_claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", progress.id)
    .eq("user_id", userId)
    .eq("completion_bonus_claimed", false)
    .select("id")
    .maybeSingle();

  if (bonusGateErr) {
    log.error("Failed to gate completion bonus claim", {
      dailyQuestRunId,
      userId,
      bonusGateErr,
    });
    // Key may already be granted; keep this retryable and do not attempt a second grant.
    return res.status(503).json({
      error: "BONUS_GATE_FAILED",
      message: "Completion bonus was not finalized. Please retry.",
      transactionHash: transactionHash ?? null,
      keyTokenId: keyTokenId ?? null,
      completionBonusRewardAmount: bonusAmount,
      completionBonusAwarded: false,
      attestationRequired: false,
    });
  }

  // 2) Only award XP if we won the gate.
  if (bonusGate) {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("privy_user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      log.error("Failed to resolve user profile for completion bonus", {
        dailyQuestRunId,
        userId,
        profileError,
      });

      await supabase
        .from("user_daily_quest_progress")
        .update({
          completion_bonus_claimed: false,
          completion_bonus_amount: 0,
          completion_bonus_claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", progress.id)
        .eq("user_id", userId);

      return res.status(500).json({
        error: "BONUS_PROFILE_NOT_FOUND",
        message: "Completion bonus could not be awarded. Please retry.",
        transactionHash: transactionHash ?? null,
        keyTokenId: keyTokenId ?? null,
        completionBonusRewardAmount: bonusAmount,
        completionBonusAwarded: false,
        attestationRequired: false,
      });
    }

    const { error: bonusXpError } = await supabase.rpc("award_xp_to_user", {
      p_user_id: profile.id,
      p_xp_amount: bonusAmount,
      p_activity_type: "daily_quest_completion_bonus_claimed",
      p_activity_data: {
        daily_quest_run_id: dailyQuestRunId,
        daily_quest_template_id: template.id,
        completion_bonus_amount: bonusAmount,
        key_claim_tx_hash: transactionHash ?? null,
      },
    });

    if (bonusXpError) {
      log.error("award_xp_to_user failed for completion bonus", {
        dailyQuestRunId,
        userId,
        bonusXpError,
      });

      await supabase
        .from("user_daily_quest_progress")
        .update({
          completion_bonus_claimed: false,
          completion_bonus_amount: 0,
          completion_bonus_claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", progress.id)
        .eq("user_id", userId);

      return res.status(503).json({
        error: "BONUS_AWARD_FAILED",
        message: "Completion bonus was not finalized. Please retry.",
        transactionHash: transactionHash ?? null,
        keyTokenId: keyTokenId ?? null,
        completionBonusRewardAmount: bonusAmount,
        completionBonusAwarded: false,
        attestationRequired: false,
      });
    }

    completionBonusAwarded = true;
  }
}
```
- Attestation integration decision (v1): daily quest task claims do **not** create EAS attestations. Keep claim endpoints DB-only for throughput and lower signing friction; do not require `attestationSignature` in daily claim payloads. Revisit in a follow-up iteration if on-chain proofs become a product requirement.

8. Implement admin UI:
- New components for daily list and form.
- Add tabs into existing admin quest pages.

9. Implement user UI:
- New tab and list/card/detail behavior.
- Make claim/completion states explicit per run day, including:
  - per-task xDG claim state
  - template completion bonus (configured on the template; awarded only after key claim)
  - quest-complete key claim CTA
  - key-pending vs key-claimed visual state (same semantics used in standard quest list/cards).
- `daily_checkin` task item rendering: show a "Verify" button (no tx-hash input, no file upload). On click, call `POST /api/daily-quests/complete-task` with the task's run task ID. The server verifies check-in status and returns success/failure. If the user hasn't checked in yet, show the error message from `CHECKIN_NOT_FOUND` and optionally link to the check-in strip/card. If already verified, show completed state. The task does not auto-complete on page load — the user must explicitly tap "Verify" to claim credit, keeping the interaction intentional.

10. Add tests and execute:
- Unit + integration + regression suites listed below.

## Edge Cases
- User completes task at `23:59:59` UTC; subsequent retries after midnight must be in the new run only.
- Admin deactivates template midday: current run remains readable but no next-day run created.
- Admin edits template tasks midday: current run behavior remains unchanged because users operate on `daily_quest_run_tasks` snapshots; edits apply on next UTC day.
- Duplicate completion requests (double-click, retries): handled by unique constraints + idempotent upsert handling.
- Duplicate completion requests must not over-count progress; completion status is derived from persisted completion row count, not incremental counters.
- On-chain tx hash reused across users/tasks/days: blocked via `daily_quest_verified_transactions` unique hash.
- On-chain tx hash reused across quest domains (standard quest → daily quest or vice versa): blocked by cross-domain `PERFORM` checks in both `register_quest_transaction` and `register_daily_quest_transaction`. Neither function allows a hash that exists in the other domain's table.
- Concurrent claim calls for the same completion/progress must award XP at most once (conditional `update ... returning` gate).
- Per-task claim: if `award_xp_to_user` fails after setting `user_daily_task_completions.reward_claimed=true`, endpoint performs compensating rollback (`reward_claimed=false`) and returns `503 XP_AWARD_FAILED` so the user can retry safely.
- Final claim with missing `lock_address` must fail fast with deterministic server error code (for example `LOCK_NOT_CONFIGURED`) instead of generic 500.
- Final key grant transaction succeeds but DB update fails: return success with tx hash and log a compensating repair task; never attempt a second on-chain grant on blind retry.
- Completion bonus: if key grant succeeded but `award_xp_to_user` fails for the completion bonus, return `503 BONUS_AWARD_FAILED` including `transactionHash` + `keyTokenId` and allow retry without re-granting the key. The `completion_bonus_claimed` gate must be rolled back to `false` when the award fails.
- Final key grant transaction fails/reverts: do not set `reward_claimed`; return retryable error.
- Double-submit final claim after successful key grant: return idempotent success or stable already-claimed response without sending another grant transaction.
- Eligibility changes during the day (balance drops):
  - Start/complete checks should evaluate at task completion time.
- Telegram failure must never fail quest creation/refresh.
- Daily run-creation race from multiple requests must produce a single run row (`upsert` on `(daily_quest_template_id, run_date)`).
- Snapshot race from multiple requests must not duplicate run tasks (`unique(daily_quest_run_id, order_index)` + insert-on-conflict).
- Writes against stale run IDs (previous UTC day) must fail with `RUN_CLOSED`.
- `supabase.from(...).upsert(..., { ignoreDuplicates: true }).select().single()` returns `null` data when the row already existed and was not inserted. `ensureTodayDailyRuns` must handle this by falling back to a `select` query to retrieve the existing run ID before proceeding with snapshot logic. Alternatively, use a two-step pattern: attempt insert, on conflict select existing row.
- `daily_checkin` task verification when check-in system is degraded (EAS disabled, `has_checked_in_today_v2` RPC fails): the verification strategy catches errors from `canCheckinToday` and returns `CHECKIN_VERIFICATION_ERROR` rather than throwing. The task stays incomplete; it does not silently pass.
- `daily_checkin` task and UTC alignment: both the daily quest run window and the check-in system use UTC day boundaries. A check-in performed at 23:58 UTC counts for today's daily quest run. After UTC midnight, a new run starts and requires a new check-in. The `has_checked_in_today_v2` RPC is network-aware; use `getDefaultNetworkName()` for the network parameter, consistent with `lib/checkin/core/service.ts`.
- `daily_checkin` task idempotency: re-verifying after already completing the task is harmless — the unique constraint on `(user_id, daily_quest_run_id, daily_quest_run_task_id)` prevents double-insertion, and the verification itself is a read-only state check.
- User completes check-in after verifying the daily_checkin task fails: the user must tap "Verify" again after checking in. The task does not auto-poll or auto-retry.

## Security Considerations
- Admin App Router endpoints (under `app/api/admin/daily-quests/`) use `ensureAdminOrRespond` from `lib/auth/route-handlers/admin-guard.ts`. If any admin endpoints are added as Pages API routes instead, use `withAdminAuth` from `lib/auth/admin-auth.ts`.
- User identity derived only from server-side Privy auth (`getPrivyUser`), not request body.
- Wallet claims validated through existing `X-Active-Wallet` validation path.
- Avoid trusting client verification payloads; verify on-chain server-side.
- Replay prevention via atomic transaction registration function with **cross-domain isolation**: `register_daily_quest_transaction` checks both `daily_quest_verified_transactions` AND `quest_verified_transactions` to prevent the same tx hash being used for both a standard quest task and a daily quest task (double-dipping). Conversely, `register_quest_transaction` (migration `116`) should be updated to also check `daily_quest_verified_transactions` — add this cross-check in the daily quests migration via `CREATE OR REPLACE FUNCTION` on the existing `register_quest_transaction`.
- Key grant path must reuse `grantKeyToUser` and `getKeyManagersForContext`; never pass empty `keyManagers` arrays.
- All `SECURITY DEFINER` RPCs called by this feature are server-only:
  - `register_daily_quest_transaction`: already revoked from `PUBLIC` in the daily quests migration.
  - `award_xp_to_user`: must be revoked from `PUBLIC` and granted only to `service_role` (see Step 1) to prevent XP injection.
- RLS is enabled (deny-by-default) on all new tables. Cross-user visibility is prevented because all data access goes through service-role API routes that enforce `user_id = authUser.id` in query filters server-side. Since `user_id` stores Privy DIDs (not Supabase auth UUIDs), `auth.uid()`-based RLS policies cannot be used directly.
- Mirror `/api/quests` read posture: `GET /api/daily-quests` and `GET /api/daily-quests/[runId]` may be called without auth, but when `authUser.id` is absent they must **not** include user-specific joins (no `user_daily_*` rows) and must **not** compute `eligibility` (which can require user profile reads and on-chain checks). All mutating endpoints (`start`, `complete-task`, `claim-task-reward`, `complete-quest`) require auth and enforce `user_id = authUser.id` in every write/query filter.

## Performance Considerations
- Indexes (all defined in migration SQL):
  - `daily_quest_runs(daily_quest_template_id, run_date)` unique (also serves as FK covering index)
  - `daily_quest_run_tasks(daily_quest_run_id, order_index)` unique (also serves as FK covering index)
  - `user_daily_quest_progress(user_id, daily_quest_run_id)` unique
  - `user_daily_quest_progress(key_claim_tx_hash)` index for support/debug parity with standard quest progress
  - `user_daily_quest_progress(key_claim_token_id)` index for support/debug parity with standard quest progress
  - `user_daily_task_completions(user_id, daily_quest_run_id, daily_quest_run_task_id)` unique
  - FK covering indexes for all remaining foreign key columns (see migration SQL)
- Batch fetch current runs with tasks in one query to avoid N+1.
- Keep daily run ensure logic idempotent and lightweight (`upsert`).
- Broadcast Telegram in batches using existing helper.
- Resolve run list with single join query (`daily_quest_runs -> daily_quest_templates -> daily_quest_run_tasks`) to avoid per-template query loops.
- `ensureTodayDailyRuns` is called on read paths (admin list, user list). It iterates active templates and performs upserts + snapshot inserts. For a small number of templates (<20) this is acceptable. If the template count grows, consider a cron-based approach or a single SQL function instead of per-template JS-loop upserts. For v1, the loop approach is fine given the expected scale.
- Telegram broadcasts triggered by `ensureRefreshNotificationSent` are fire-and-forget (await-ed but errors caught). They must never block the HTTP response or cause the list API to fail.

## Migration Impact
- Additive migration only; no mutation of existing quest tables.
- No destructive changes.
- Deployment order:
  1. Apply migration (`supabase migration up --local`).
  2. Deploy API/UI code.
  3. Validate with admin-created test daily quest.

## Full Test Plan
### Unit tests
- `lib/quests/verification/daily-checkin-verification`:
  - Returns `success: true` when `canCheckinToday` returns `false` (user has checked in).
  - Returns `CHECKIN_NOT_FOUND` when `canCheckinToday` returns `true` (user has not checked in).
  - Returns `WALLET_REQUIRED` when `userAddress` is empty/missing.
  - Returns `CHECKIN_VERIFICATION_ERROR` when `canCheckinToday` throws (service unavailable).
  - Mock `getDefaultCheckinService` to isolate from real RPC/DB calls.
- `lib/quests/daily-quests/constraints`:
  - Level requirement pass/fail.
  - GoodDollar requirement pass/fail.
  - Lock key ownership pass/fail.
  - ERC20 balance threshold pass/fail.
- `lib/quests/verification/uniswap-verification`:
  - Correct pair/event parsing.
  - Wrong router/pair rejection.
  - Amount threshold checks.
  - Direction validation (`A_TO_B` vs `B_TO_A`) against actual token flow.
- `lib/quests/daily-quests/runs`:
  - Ensures one run/template/day.
  - Ensures run task snapshots are created exactly once per run.
  - Ensures writes are rejected for closed/out-of-window runs.
  - Notification dedupe behavior.

### Integration tests
- Admin create daily quest with mixed tasks (vendor + uniswap + daily_checkin) and configured `lock_address`.
- User can fetch today run and complete eligible tasks.
- User final claim only after all tasks are completed and triggers on-chain key grant.
- Final claim stores `key_claim_tx_hash` and `key_claim_token_id` on `user_daily_quest_progress`.
- When `daily_quest_templates.completion_bonus_reward_amount > 0`, final claim awards bonus XP exactly once and persists:
  - `user_daily_quest_progress.completion_bonus_claimed = true`
  - `completion_bonus_amount = <template bonus>`
  - `completion_bonus_claimed_at != null`
- Replay-protection blocks duplicated tx hash within daily quests.
- Replay-protection blocks cross-domain tx reuse: a tx hash used in a standard quest task is rejected by `register_daily_quest_transaction`, and vice versa.
- Deactivate template prevents future day runs.
- `daily_checkin` task: user who has not checked in gets `CHECKIN_NOT_FOUND`; user checks in via `/api/checkin`; user retries verify and task completes.
- `daily_checkin` task does not trigger replay-prevention registration (no tx hash involved).

### Edge case tests
- Midnight boundary: completion before and after UTC rollover.
- Unauthenticated reads:
  - `GET /api/daily-quests` returns runs/tasks but omits `eligibility` and all user-specific state.
  - `GET /api/daily-quests/[runId]` returns run/tasks but omits `user_daily_*` state.
- Prerequisite key on a different linked wallet:
  - User has the required lock key on Wallet A (linked), but `X-Active-Wallet` is Wallet B.
  - Eligibility still returns `eligible: true` (lock-key check is across linked wallets), and the user can start the daily quest.
- Concurrent completion requests for same task.
- Concurrent completion requests for different tasks in the same run cannot produce inconsistent final completion state.
- Concurrent reward-claim requests for same task/quest (single XP award).
- Concurrent final key-claim requests produce at most one on-chain grant transaction.
- Completion bonus retry without re-grant:
  - Force `award_xp_to_user` to fail once (mock RPC error) after a successful key grant.
  - Verify the endpoint returns `503 BONUS_AWARD_FAILED` **with** `transactionHash` + `keyTokenId`.
  - Retry `POST /api/daily-quests/complete-quest` and verify it does **not** send a second grant transaction and does award the bonus successfully.
- Midday template edits do not affect already-created run tasks.
- Telegram broadcast errors do not break API success response.
- Eligibility initially true then false mid-run.
- Missing template `lock_address` on final claim returns deterministic `LOCK_NOT_CONFIGURED`.
- `daily_checkin` verification when check-in service RPC fails returns `CHECKIN_VERIFICATION_ERROR` (not 500).
- `daily_checkin` task on a run where the user checked in yesterday but not today: verification correctly fails because `has_checked_in_today_v2` is scoped to the current UTC day.
- Vendor gating misconfiguration:
  - Template sets `eligibility_config.min_vendor_stage`, but `NEXT_PUBLIC_DG_VENDOR_ADDRESS` is missing (or RPC read fails).
  - Eligibility returns `eligible: false` with `vendor_stage` failure message `"Vendor level check unavailable"`.

## Regression Risk Tests
- Existing quest APIs remain green:
  - `/api/quests`, `/api/quests/[id]`, `/api/quests/complete-task`, `/api/quests/complete-quest`.
- Admin existing quest management unaffected:
  - `pages/admin/quests/index.tsx`, `QuestForm` create/edit/delete.
- Existing verification strategies unchanged for vendor/deploy lock.
- Existing standard quest key grant flow remains unchanged (`/api/quests/complete-quest`).
- Notification center and existing quest-created broadcasts still function.
- Existing daily check-in system unchanged: `pages/api/checkin/index.ts`, `lib/checkin/core/service.ts`, `hooks/checkin/useDailyCheckin.ts`, and `has_checked_in_today_v2` RPC remain unmodified. The `DailyCheckinVerificationStrategy` is a read-only consumer.
- `register_quest_transaction` SQL function is replaced via `CREATE OR REPLACE` to add the cross-domain daily quest check. The function signature and return contract are unchanged; the only behavioral change is that it now also rejects tx hashes already present in `daily_quest_verified_transactions`. Existing standard quest flows continue to work identically for hashes that are not in the daily table. Verify with existing `quest_verified_transactions` replay-prevention tests.

## Plan Validation Checklist
- [x] No new dependencies introduced unless justified
- [x] Reuses existing utilities, hooks, services, and patterns
- [x] No duplication of existing logic
- [x] Avoids needless abstraction or premature generalization
- [x] Edge cases documented
- [x] Failure states handled
- [x] Security implications evaluated
- [x] SECURITY DEFINER RPCs are server-only (REVOKE/GRANT)
- [x] Cross-domain tx replay prevention (standard ↔ daily) enforced in both SQL functions
- [x] Migration safety reviewed (if applicable)
- [x] Test cases fully defined
- [x] Regression risks identified
