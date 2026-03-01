# OpenRouter AI Integration (Platform-Wide)

This document describes the current OpenRouter AI integration in the P2E Inferno codebase, starting with AI vision verification for quest `submit_proof` tasks. It also documents the reusable building blocks (`lib/ai/*`, `lib/ai/verification/*`) and how to extend them to other features (admin tools, content generation, chat widgets, etc.).

## Architecture

The integration is structured in layers:

1. **Core OpenRouter client** (`lib/ai/*`)
   - One `chatCompletion(...)` function (fetch-based) that any server-side code can call.
2. **Reusable AI helpers** (`lib/ai/verification/*`)
   - Shared prompt + parsing logic for specific AI patterns (first: vision decisioning).
3. **Feature consumers**
   - Thin adapters that validate inputs, call the shared helper, and map outcomes into domain statuses and UX.

The first consumer is AI vision for quest screenshot verification, but the core and helper layers are designed for reuse across the platform.

## Core AI Module (`lib/ai/*`)

### Files

- `lib/ai/types.ts`: OpenAI-compatible message content types and result union.
- `lib/ai/client.ts`: OpenRouter `chatCompletion(...)` client (fetch; no SDK).
- `lib/ai/index.ts`: barrel exports.
- `lib/ai/__tests__/client.test.ts`: unit tests for the client.

### `chatCompletion(...)` behavior

- Reads `OPENROUTER_API_KEY` (server-only).
- Uses `OPENROUTER_DEFAULT_MODEL` if provided, else falls back to `google/gemini-2.0-flash-001`.
- Supports vision messages via OpenAI-compatible `image_url` content.
- Supports fallback routing via OpenRouter by sending:
  - `route: "fallback"`
  - `models: [primaryModel, ...fallbacks]`
- Returns a success/error result union; network/API failures do not crash callers that handle the union (but missing API key throws).

## Reusable Helpers (`lib/ai/verification/*`)

Helpers in this folder are intended to be **feature-agnostic** and reusable across the app.

### Vision decision helper

File: `lib/ai/verification/vision.ts`

Export:

- `verifyScreenshotWithAI(...)`

It requests a structured JSON response from the model:

```json
{
  "decision": "approve" | "retry" | "defer",
  "confidence": 0.0,
  "reason": "short explanation"
}
```

Behavior notes:

- Parser is robust to code fences and extra commentary.
- Backward compatible with `{ "verified": boolean, "confidence": number, "reason": string }`.
- Enforces a **server-side** confidence gate:
  - If the model says `approve` but `confidence < threshold`, the helper converts that into `retry` to reduce admin queue noise.

## Consumer 1: Quest AI Vision Verification (`submit_proof`)

### Goal

Automatically process screenshot proof submissions with three outcomes:

- **Approve** → `completed`
- **Retry** → `retry` (user resubmits; avoids admin bottlenecks)
- **Defer** → `pending` (admin review)

### Strategy wiring (how the AI strategy is “set”)

File: `lib/quests/verification/registry.ts`

- Quest verification uses a strategy registry keyed by `TaskType`.
- `submit_proof` is mapped to the AI vision strategy:
  - `AIVerificationStrategy` in `lib/quests/verification/ai-vision-verification.ts`

### Admin configuration (per task)

Stored in `quest_tasks.task_config` for `submit_proof` tasks:

- `ai_verification_prompt` (string, required for AI to run)
  - Describes what the screenshot must show to count as proof.
- `ai_prompt_required` (boolean, optional)
  - When true, blocks saving the quest unless `ai_verification_prompt` is set.
- `ai_model` (string, optional)
  - Model override for this task.
  - Default: `google/gemini-2.0-flash-001`
- `ai_confidence_threshold` (number, optional)
  - Auto-approve threshold.
  - Default: `0.7`

Admin UI:

- Editor (`/admin/quests/[id]/edit`):
  - `components/admin/QuestTaskForm.tsx` shows the AI config section and toggle.
  - `components/admin/QuestForm.tsx` enforces save-time validation when `ai_prompt_required` is enabled.
- Details (`/admin/quests/[id]` → Tasks tab):
  - `pages/admin/quests/[id].tsx` shows prompt/model/threshold/toggle without needing to open the editor.

### Submission flow (server)

Integration point: `POST /api/quests/complete-task`

File: `pages/api/quests/complete-task.ts`

For `submit_proof`:

1. **Proof input validation**
   - If proof URL is missing → `400 PROOF_URL_REQUIRED` (prevents crafted bypasses).
2. **Run AI strategy (if configured)**
   - Strategy runs only if `task_config.ai_verification_prompt` is present.
3. **Map AI result to status**
   - `approve` → `submission_status = "completed"`
   - `retry` → `submission_status = "retry"`, and `admin_feedback` is set to the AI reason (user guidance)
   - `defer` → `submission_status = "pending"`
4. **Admin notifications**
   - New submissions that end up `pending` trigger `sendQuestReviewNotification(...)`.
   - `retry` does not notify admins.

### Submission flow (client)

File: `pages/lobby/quests/[id].tsx`

The API returns `submissionStatus` and optionally `feedback`:

- `completed` → success toast
- `pending` → success toast (“submitted for review”)
- `retry` → error toast showing the AI feedback

The task list UI already renders `retry` state and displays `admin_feedback`:

- `components/quests/TaskItem.tsx`

## Data stored

For AI-driven `submit_proof` submissions:

### `user_task_completions.verification_data` (JSONB)

Stored fields include:

- `proofUrl`
- `verificationMethod: "ai"`
- `aiDecision` (`approve|retry|defer`)
- `aiVerified` (boolean)
- `aiConfidence` (number)
- `aiReason` (string)
- `aiModel` (string, actual model used)
- `verifiedAt` (ISO string)

On AI parse failures:

- `aiRawContent` is stored (only for that error case).

### `user_task_completions.admin_feedback`

When AI requests retry:

- `admin_feedback` is set to the AI’s `reason` so the user sees what to fix and can resubmit.

## Files created / modified (current implementation)

### Created

- `lib/ai/types.ts`
- `lib/ai/client.ts`
- `lib/ai/index.ts`
- `lib/ai/__tests__/client.test.ts`
- `lib/ai/verification/vision.ts`
- `lib/quests/verification/ai-vision-verification.ts`
- `lib/quests/verification/__tests__/ai-verification.test.ts`

### Modified

- `lib/quests/verification/registry.ts`
- `pages/api/quests/complete-task.ts`
- `pages/lobby/quests/[id].tsx`
- `pages/admin/quests/[id].tsx`
- `components/admin/QuestTaskForm.tsx`
- `components/admin/QuestForm.tsx`
- `__tests__/integration/pages/api/quests/complete-task.test.ts`
- `.env.example`
- `next-env.d.ts`, `tsconfig.json`

## Extending the integration to other features

### When to call `chatCompletion(...)` directly

Use `lib/ai/client.ts` directly for straightforward text tasks (summaries, rewriting, classification) where the caller can interpret plain text output.

### When to create a helper under `lib/ai/verification/*`

Create a helper when you need:

- A strict JSON schema
- Robust parsing of model output
- Deterministic post-processing (e.g., confidence gating)
- A reusable decisioning pattern across multiple features

### Recommended extension pattern

1. Add a helper: `lib/ai/verification/<name>.ts`
2. Add a feature adapter that:
   - validates inputs
   - calls the helper
   - maps outcomes into your domain’s state machine and UX
3. Store only the minimum structured metadata needed for debugging and admin/user guidance.

### Examples of future consumers

- **Admin tools**: summarize submissions, generate task descriptions, draft email responses.
- **User chat widgets**: multi-turn chat using the same `chatCompletion(...)`.
- **Other vision checks**: reuse `verifyScreenshotWithAI(...)` for any “approve/retry/defer” screenshot workflows.

## Next steps (not implemented here)

- Define product-driven rules/examples to better distinguish `retry` vs `defer` (so users aren’t over-prompted to retry).
- Add structured “retry reasons” (enum) for analytics and consistent UI messaging.
