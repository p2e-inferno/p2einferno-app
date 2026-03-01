# Quest Task Review Automation — Findings & Context

**Date**: 2026-02-26
**Purpose**: Research document capturing the full picture of quest task types, how they're used in practice, how the verification system works in the codebase, and a well-reasoned categorisation of how each manual task should be automated — code-first where the verification criteria are deterministic, AI only where the problem is genuinely unstructured.

---

## 1. Background

P2E Inferno has a quest system where users complete tasks to earn DG tokens. Tasks fall into two broad categories today:

- **Automatic** — verified programmatically (blockchain state, Privy account links, on-chain events). No human needed.
- **Manual** — require an admin to review a user's submission (screenshot, URL, text) and approve, reject, or request a retry.

Manual review does not scale. The goal of this document is to design the right automation for each task. The guiding principle is:

> **Code-first**: if verification criteria are deterministic and the necessary data exists (blockchain, DB, or third-party API), automate with code. AI is reserved for tasks where the input is genuinely unstructured and cannot be verified programmatically — primarily screenshot/image submissions where there is no API or on-chain proxy.

---

## 2. Codebase: What Already Exists

Before categorising tasks, three key infrastructure discoveries from codebase investigation that significantly change the automation picture:

### 2.1 DG Pullout Already Tracked in DB

**File**: `supabase/migrations/086_dg_token_withdrawals.sql`, `app/api/token/withdraw/`

The `dg_token_withdrawals` table records every pullout with:
- `user_id`, `wallet_address`, `amount_dg`, `status` (`pending`/`completed`/`failed`), `transaction_hash`, `completed_at`

The platform itself sets `status = 'completed'` and records the `transaction_hash` after the on-chain transfer is confirmed. This means **the "Mission: Pullout" task can be verified entirely from within the platform's own database — no URL submission required**.

### 2.2 GoodDollar Verification Already On-Chain + In DB

**Files**: `lib/gooddollar/identity-sdk.ts`, `pages/api/gooddollar/verify-callback.ts`

The GoodDollar callback handler:
1. Calls `checkWhitelistStatus(walletAddress)` on-chain to confirm the wallet is whitelisted on the GoodDollar identity contract
2. Stores the result in `users`: `is_face_verified`, `face_verified_at`, `face_verification_expiry`, `face_verification_proof_hash`

This means **the "Complete Your GoodDollar Verification" task can be verified by querying the DB or calling the on-chain contract — no screenshot required**.

### 2.3 ETH Transfer Verification Not Yet Implemented

**File**: `lib/quests/verification/registry.ts`

The verification registry currently only handles vendor tasks and `deploy_lock`. There is no strategy for raw ETH transfers (native value transfers). However, the infrastructure (`viem` public client, strategy pattern) is all in place to add one.

---

## 3. Full Quest & Task Inventory — Re-Categorised

Each manual task is now assessed against three questions:
1. Can the data needed for verification be obtained from the blockchain, an internal DB, or a reliable third-party API?
2. If yes → automate with code (new task type or new verification strategy)
3. If no → is AI the right tool, or should the task design be changed?

---

### 3.1 Rosy Beginnings
**Status**: Active | **Reward**: 4,000 DG | **Tasks**: 5

All tasks are automatic. No changes needed.

| # | Task | Type | Status |
|---|------|------|--------|
| 1 | Link Email Account | `link_email` | ✅ Auto |
| 2 | Connect Wallet | `link_wallet` | ✅ Auto |
| 3 | Sign Terms of Service | `sign_tos` | ✅ Auto |
| 4 | Link Telegram | `link_telegram` | ✅ Auto |
| 5 | Link Farcaster | `link_farcaster` | ✅ Auto |

---

### 3.2 Ether Flames
**Status**: Inactive | **Reward**: 2,000 DG | **Tasks**: 1

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | ETH is money | `submit_url` | **Code** | `eth_transfer` |

**Task description**: Send ≥0.0005 ETH to your linked wallet address; submit transaction URL.

**Why code**: The verification criteria are entirely deterministic. Parse the submitted URL to extract the transaction hash, query the Base RPC via `viem` `getTransactionReceipt()`, and check: (1) tx succeeded, (2) `to` address = user's linked self-custody wallet, (3) native ETH value ≥ 0.0005 ETH (500000000000000 wei), (4) transaction is on Base network.

**New task type needed**: `eth_transfer`
- `task_config`: `{ to: "{user.linked_wallet}", min_value_wei: "500000000000000", network: "base" }`
- Input: user submits a transaction hash (or BaseScan URL)
- Verification: RPC call, all checks deterministic

---

### 3.3 Set Up Your Web3 Wallet
**Status**: Active | **Reward**: 1,000 DG | **Tasks**: 2

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | Install a Self-Custody Wallet | `submit_proof` | **AI** | `submit_proof` (keep) |
| 2 | Link Your External Wallet | `link_wallet` | ✅ Auto | — |

**Task 1 description**: Submit a screenshot of your wallet home screen (proves install & setup; seed phrase backed up offline).

**Why AI**: There is no API, on-chain signal, or database record that proves a user installed a wallet app on their device. The screenshot is the only available evidence. A vision model can verify: (1) the image shows a recognisable wallet UI (MetaMask, Rabby, Trust Wallet), (2) a wallet address is visible, (3) it is not a blank screen or the P2E Inferno app itself. This is a genuine AI use case — unstructured visual input with no programmatic equivalent.

---

### 3.4 ETH is Money
**Status**: Active | **Reward**: 1,000 DG | **Tasks**: 2

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | Gas Drop | `custom` | **Code** | `gas_drop` |
| 2 | Find Your Transaction on the Block Explorer | `submit_url` | **Code** | `eth_transfer` |

**Task 1 — Gas Drop description**: User submits their self-custody wallet address; admin sends ETH gas to it on Base Mainnet.

**Why code**: The user is submitting a wallet address, not a proof of action. Code can validate: (1) it is a valid Ethereum address format, (2) it matches the user's Privy-linked external wallet (preventing people submitting someone else's address). Once validated, the gas drop itself can be automated — trigger the server-side ETH send automatically rather than having an admin manually initiate it. The entire flow becomes: submit address → validate → auto-send → mark complete.

**New task type needed**: `gas_drop`
- Validates address against linked wallet
- Triggers automated gas send via existing `transferDGTokens()` infrastructure (adapted for native ETH)
- Marks complete on confirmation

**Task 2 — Block Explorer description**: User goes to BaseScan, finds the tx where they received ETH, copies and submits the transaction hash.

**Why code**: Exact same `eth_transfer` verification as Ether Flames Task 1. Check: tx on Base, `to` = user's self-custody wallet from Task 1, ETH value > 0, tx succeeded. Task config can reference the gas drop amount sent in Task 1.

**New task type needed**: `eth_transfer` (same type as Ether Flames)

---

### 3.5 Celo and the GoodDollar
**Status**: Active | **Reward**: 100 DG | **Tasks**: 1

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | Complete Your GoodDollar Verification | `submit_proof` | **Code** | `gooddollar_verified` |

**Task description**: Upload a screenshot of the lobby showing the "verified" status on the Verify Identity card.

**Why code, not AI**: This is the clearest example of a task that shouldn't need AI at all. GoodDollar verification is already fully tracked — both on-chain (the GoodDollar identity contract records whitelisted wallets) and in the DB (`users.is_face_verified`, `users.face_verification_expiry`). When a user completes face verification, the callback at `pages/api/gooddollar/verify-callback.ts` already calls `checkWhitelistStatus(wallet)` on-chain and writes the result to the DB. A task verification strategy just needs to query: `is_face_verified = true AND face_verification_expiry > NOW()`. No screenshot needed.

**New task type needed**: `gooddollar_verified`
- No user input required
- Verification: DB query on `users` table for `is_face_verified` and expiry, optionally backed by on-chain `checkWhitelistStatus()` call
- Can be triggered on-demand or polled when the user clicks "complete"

---

### 3.6 Show Not Tell
**Status**: Active | **Reward**: 1,900 DG | **Tasks**: 1

| # | Task | Type | Status |
|---|------|------|--------|
| 1 | Proof of Personhood | `complete_external` | ✅ Auto |

Already automatic — triggered when the GoodDollar quest completes. Once `gooddollar_verified` type is implemented in the previous quest, this chain-trigger remains unchanged.

---

### 3.7 Enter the $DG Nation
**Status**: Active | **Reward**: 7,000 DG | **Tasks**: 5

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | Learn the Mechanics part I | `submit_proof` | **AI** | `submit_proof` (keep) |
| 2 | Learn the Mechanics part II | `submit_proof` | **AI** | `submit_proof` (keep) |
| 3 | Learn the Mechanics part III | `submit_proof` | **AI** | `submit_proof` (keep) |
| 4 | Learn the Mechanics part IV | `submit_proof` | **AI** | `submit_proof` (keep) |
| 5 | Connect to DG Nation Broadcast | `submit_proof` | **Code** | `youtube_subscribe` |

**Tasks 1–4 description**: Users submit screenshots from specific pages of the DG Token Vendor interface (`vendor.dreadgang.gg/token-vendor`, `/power-up`, `p2einferno.com/lobby/vendor`) to prove they visited and explored the system.

**Why AI for Tasks 1–4**: These are educational engagement tasks on external or internal pages. There is no on-chain state or API signal that proves a user visited a specific page and saw its contents. Note that for Task III (power-up page), the user's stage/points/fuel is on-chain and could theoretically be queried via `getUserState()`, but having on-chain vendor state does not prove the user actually visited and read the power-up page — the educational intent would be undermined by using existing state as a proxy. Vision AI is the right tool: verify the screenshot shows the correct page, the expected data sections are visible, and ideally the user's connected wallet address appears in the screenshot (which can be cross-checked against the user's linked wallet).

**Task 5 — Connect to DG Nation Broadcast description**: Submit a screenshot showing subscription to P2E Inferno YouTube channel with notifications enabled.

**Why code**: YouTube Data API v3 supports OAuth-based subscription checks. Flow: (1) user connects their YouTube account via Google OAuth (one-time, can be stored in profile), (2) server calls the YouTube Subscriptions API to verify subscription to the P2E Inferno channel ID, (3) notification preference can also be checked via the API. This is fully deterministic — no screenshot needed. The subscription either exists or it doesn't.

**New task type needed**: `youtube_subscribe`
- `task_config`: `{ channel_id: "UCxxxxxx", require_notifications: true }`
- Requires: user has connected Google/YouTube account (new OAuth flow)
- Verification: YouTube Data API v3 `subscriptions.list` + notification settings

---

### 3.8 Magic Internet Money
**Status**: Active | **Reward**: 1,500 DG | **Tasks**: 1

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | Mission: Pullout | `submit_url` | **Code** | `in_app_pullout` |

**Task description**: Use DG Pullout to convert xDG to $DG, then submit the transaction link from Pullout History as proof.

**Why code, not AI or URL parsing**: This is the most unnecessary manual review in the entire system. The platform itself initiates and records every pullout in `dg_token_withdrawals`. When the on-chain transfer confirms, the platform sets `status = 'completed'` and records the `transaction_hash`. There is zero need for the user to copy-paste a transaction link — the data is already in the DB. Verification simply queries: `SELECT * FROM dg_token_withdrawals WHERE user_id = $userId AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`. If a completed pullout exists, the task is done.

**New task type needed**: `in_app_pullout`
- No user input required
- Verification: internal DB query on `dg_token_withdrawals`
- Can optionally cross-check `transaction_hash` on-chain for extra security

---

### 3.9 Get $UP Anon
**Status**: Active | **Reward**: 2,500 DG | **Tasks**: 1

| # | Task | Type | Status |
|---|------|------|--------|
| 1 | Sell $DG | `vendor_sell` | ✅ Auto |

Already automatic via `TokensSold` event verification. No changes needed.

---

### 3.10 Share Your Journey
**Status**: Active | **Reward**: 10,500 DG | **Tasks**: 2

| # | Task | Current Type | Automation | New Type |
|---|------|-------------|------------|----------|
| 1 | Generate Your Proof Code | `submit_text` | ✅ Semi-Auto | Add format validation |
| 2 | Show Others What's Possible | `submit_url` | **Code** (primary) + AI fallback | `social_post` |

**Task 1 description**: Derive and submit personal proof code (`DG-0x{wallet}`). No review flag — stored only.

Already `requires_admin_review: false`. Can add server-side format validation: regex check that the submitted code matches `DG-0x{user's wallet address}` exactly. Prevents users submitting wrong codes that would block Task 2.

**Task 2 description**: Post a 30s–3min video on Twitter/YouTube/TikTok/Instagram/Farcaster/Base App with proof code in the caption, `#P2EInferno`, and at least 1 like. Submit the post URL.

**Why code (primarily)**: The verification criteria are all deterministic: (1) proof code from Task 1 is present in post description, (2) `#P2EInferno` is present, (3) post has ≥1 like, (4) post is publicly accessible, (5) post is a video. All of these are checkable via platform APIs for the listed platforms:

| Platform | API Availability | Checks Possible |
|----------|-----------------|-----------------|
| YouTube | YouTube Data API v3 (API key, no user OAuth for public videos) | Video exists, description contains proof code + hashtag, like count, public |
| Twitter/X | Twitter API v2 (Bearer token) | Tweet exists, text contains proof code + hashtag, like count, public |
| Farcaster / Base App | Farcaster Hub API (open, no auth) | Cast exists, text contains proof code + hashtag, reactions count, public |
| TikTok | TikTok API (restricted) | Limited — fallback to AI |
| Instagram | Instagram API (restricted for 3P) | Limited — fallback to AI |

For YouTube, Twitter, and Farcaster (which covers Base App): fully automated with platform APIs. For TikTok and Instagram: the post URL can be fetched and a lightweight AI/text extraction can check for the proof code and hashtag, with like count checked via oembed where available.

**New task type needed**: `social_post`
- `task_config`: `{ require_proof_code: true, require_hashtag: "#P2EInferno", min_likes: 1, require_video: true, supported_platforms: ["youtube", "twitter", "farcaster", "tiktok", "instagram"] }`
- Verification: detect platform from URL → call appropriate API → check all criteria deterministically → fallback to AI for platforms with limited API access

---

## 4. Summary: Updated Automation Categories

### Tasks Requiring New Code Task Types

| Task | Quest | Current Type | New Type | Complexity |
|------|-------|-------------|----------|------------|
| ETH is money | Ether Flames | `submit_url` | `eth_transfer` | Low |
| Gas Drop | ETH is Money | `custom` | `gas_drop` | Low-Medium |
| Find Your Transaction | ETH is Money | `submit_url` | `eth_transfer` | Low |
| Complete GoodDollar Verification | Celo & GoodDollar | `submit_proof` | `gooddollar_verified` | Low (data exists) |
| Mission: Pullout | Magic Internet Money | `submit_url` | `in_app_pullout` | Low (data exists) |
| Connect to DG Nation Broadcast | Enter $DG Nation | `submit_proof` | `youtube_subscribe` | Medium |
| Show Others What's Possible | Share Your Journey | `submit_url` | `social_post` | Medium-High |

**7 manual tasks → code automation. Zero AI needed.**

### Tasks Requiring AI (Vision Model)

| Task | Quest | Type | Why AI |
|------|-------|------|--------|
| Install a Self-Custody Wallet | Set Up Web3 Wallet | `submit_proof` | No API/chain signal proves wallet install. Screenshot is the only evidence. |
| Learn Mechanics part I | Enter $DG Nation | `submit_proof` | External site visit — no API to verify page was viewed |
| Learn Mechanics part II | Enter $DG Nation | `submit_proof` | External site visit — no API to verify page was viewed |
| Learn Mechanics part III | Enter $DG Nation | `submit_proof` | On-chain state exists but doesn't prove the user read the page |
| Learn Mechanics part IV | Enter $DG Nation | `submit_proof` | Internal page visit — no tracking currently in place |

**5 manual tasks → AI vision review.**

### Already Automatic (No Changes Needed)

`link_email`, `link_wallet` (×2), `sign_tos`, `link_telegram`, `link_farcaster`, `vendor_sell`, `complete_external`, `submit_text` (proof code, no review)

---

## 5. New Task Types Required

### 5.1 `eth_transfer`
Verifies a native ETH transfer on a specified network.

```typescript
// task_config shape
{
  to: "linked_wallet" | "0x...",    // "linked_wallet" = user's Privy-linked external wallet
  min_value_wei?: string,            // e.g. "500000000000000"
  network: "base" | "mainnet" | "arbitrum"
}
```

**Verification logic**:
1. Accept: user-submitted tx hash or a BaseScan/Etherscan URL (parse to extract hash)
2. `getTransactionReceipt(txHash)` via viem public client for the specified network
3. Assert: `receipt.status === 'success'`
4. Assert: `receipt.to.toLowerCase() === expectedTo.toLowerCase()`
5. If `min_value_wei`: `getTransaction(txHash)` and assert `tx.value >= BigInt(min_value_wei)`
6. Replay prevention: register tx hash in `quest_verified_transactions`

**Files to create/modify**:
- New: `lib/quests/verification/eth-transfer-verification.ts`
- Modify: `lib/quests/verification/registry.ts` (register strategy)
- Modify: `lib/supabase/types.ts` (add `eth_transfer` to `TaskType`)

---

### 5.2 `gas_drop`
Validates a submitted wallet address and automatically sends ETH gas.

```typescript
// task_config shape
{
  amount_wei: string,               // ETH amount to send, e.g. "500000000000000"
  network: "base" | "mainnet",
  must_match_linked_wallet: boolean // default true
}
```

**Verification logic**:
1. Accept: user-submitted Ethereum address
2. Assert: valid `0x` + 40 hex char format
3. If `must_match_linked_wallet`: assert address matches user's Privy-linked external wallet
4. Assert: address is not a known contract address (optional, via RPC `getCode`)
5. Trigger: server-side ETH send (adapt existing gas infrastructure)
6. On confirmation: mark task `completed` with tx hash in `verification_data`

**Files to create/modify**:
- New: `lib/quests/verification/gas-drop-verification.ts`
- Modify: `lib/quests/verification/registry.ts`
- Modify: `lib/supabase/types.ts`

---

### 5.3 `gooddollar_verified`
Verifies GoodDollar proof-of-personhood using existing DB and on-chain data.

```typescript
// task_config shape
{
  require_active: boolean   // default true — checks expiry
}
```

**Verification logic**:
1. No user input required (triggered when user clicks "complete task")
2. Query `users` table: `is_face_verified = true AND face_verification_expiry > NOW()`
3. Optional secondary check: `checkWhitelistStatus(userWallet)` on GoodDollar identity contract
4. Mark complete immediately if verified; return error with guidance if not

**Files to create/modify**:
- New: `lib/quests/verification/gooddollar-verification.ts`
- Modify: `lib/quests/verification/registry.ts`
- Modify: `lib/supabase/types.ts`

---

### 5.4 `in_app_pullout`
Verifies a completed DG Pullout using existing internal platform records.

```typescript
// task_config shape
{
  min_amount_dg?: number,           // optional minimum pullout amount
  after_quest_start?: boolean       // only count pullouts after quest was started
}
```

**Verification logic**:
1. No user input required
2. Query `dg_token_withdrawals`: `user_id = $userId AND status = 'completed'`
3. If `min_amount_dg`: assert `amount_dg >= min_amount_dg`
4. Mark complete with `verification_data` containing `{ withdrawal_id, transaction_hash, amount_dg, completed_at }`

**Files to create/modify**:
- New: `lib/quests/verification/in-app-pullout-verification.ts`
- Modify: `lib/quests/verification/registry.ts`
- Modify: `lib/supabase/types.ts`

---

### 5.5 `youtube_subscribe`
Verifies a YouTube channel subscription via Google OAuth + YouTube Data API v3.

```typescript
// task_config shape
{
  channel_id: string,               // e.g. "UCxxxxxxxxxxxxxx"
  channel_handle?: string,          // e.g. "@P2EInferno" (for display)
  require_notifications?: boolean   // check notification preference
}
```

**Verification logic**:
1. User must have connected Google/YouTube account (new OAuth scope: `youtube.readonly`)
2. Store Google OAuth tokens in user profile (encrypted)
3. Call `youtube.subscriptions.list` API: check if `channel_id` is in user's subscriptions
4. If `require_notifications`: check notification preference via `subscriptions.list` `contentDetails`
5. Mark complete if subscription confirmed

**New infrastructure needed**:
- Google OAuth integration (new scope beyond existing Privy)
- Store/manage YouTube OAuth tokens in `user_profiles`
- New API route: `pages/api/quests/verify-youtube-subscription.ts`

**Files to create/modify**:
- New: `lib/quests/verification/youtube-subscribe-verification.ts`
- New: `pages/api/auth/youtube-connect.ts` (OAuth callback)
- Modify: `lib/supabase/types.ts`

---

### 5.6 `social_post`
Verifies a public social media post contains required content and meets engagement criteria.

```typescript
// task_config shape
{
  require_proof_code: boolean,      // check post contains DG-0x{wallet}
  require_hashtag?: string,         // e.g. "#P2EInferno"
  min_likes?: number,               // e.g. 1
  require_video?: boolean,
  supported_platforms: string[]     // ["youtube", "twitter", "farcaster", "tiktok", "instagram"]
}
```

**Verification logic**:
1. Accept: user-submitted post URL
2. Detect platform from URL hostname
3. Platform-specific API call:
   - **YouTube**: YouTube Data API v3 — video details, description, like count, public status
   - **Twitter/X**: Twitter API v2 (bearer token) — tweet text, public_metrics.like_count
   - **Farcaster/Base App**: Farcaster Hub API — cast text, reactions.likes_count
   - **TikTok/Instagram**: Lightweight web fetch + text extraction (or AI fallback)
4. Deterministic checks: proof code substring match, hashtag substring match, like count, video type
5. Proof code match: compare against user's Task 1 submission from the same quest

**Files to create/modify**:
- New: `lib/quests/verification/social-post-verification.ts`
- New: `lib/social/platform-api.ts` (unified platform API client)
- Modify: `lib/quests/verification/registry.ts`
- Modify: `lib/supabase/types.ts`

---

## 6. AI Verification Layer (For Remaining `submit_proof` Tasks)

For the 5 tasks that genuinely require screenshot verification, an AI vision strategy is appropriate. These should remain as `submit_proof` task type but route through an `AIImageVerificationStrategy` rather than the human review queue.

The vision layer is **provider-agnostic**. Rather than hard-coding a specific model (e.g. Claude Vision), all AI image calls are routed through **OpenRouter** (`https://openrouter.ai/api/v1`), which exposes a single OpenAI-compatible endpoint in front of every major vision model. Switching models is a one-line env var change — no code changes required.

---

### 6.0 OpenRouter Integration

#### Why OpenRouter

| Concern | Without OpenRouter | With OpenRouter |
|---------|--------------------|-----------------|
| Model choice | Hard-coded to one provider | Any vision model available; swap via env var |
| Cost control | Provider pricing is fixed | Choose cheaper models for simpler tasks; set `max_price` ceiling |
| Reliability | Single point of failure | Automatic model fallback chain if primary is unavailable or rate-limited |
| Vendor lock-in | Rebuilding required to switch | Zero code changes to switch models |

#### Environment Variables

```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-...

# Optional — sensible defaults shown below
OPENROUTER_VISION_MODEL=google/gemini-2.0-flash              # default model
OPENROUTER_VISION_FALLBACK_MODELS=anthropic/claude-3-haiku,openai/gpt-4o-mini  # comma-separated
OPENROUTER_VISION_MAX_PRICE_PROMPT=0.001       # $/1k prompt tokens ceiling (optional)
OPENROUTER_VISION_MAX_PRICE_COMPLETION=0.002   # $/1k completion tokens ceiling (optional)
OPENROUTER_APP_TITLE=P2EInferno                # shown in OpenRouter dashboard
OPENROUTER_APP_URL=https://p2einferno.com      # for attribution/leaderboard
```

#### Suggested Model Tiers

| Tier | Model slug | Use case |
|------|-----------|----------|
| Budget | `google/gemini-2.0-flash` | Default. Fast, cheap, strong vision. Good for clear UI screenshots. |
| Budget | `meta-llama/llama-3.2-11b-vision-instruct` | Free tier available; useful as a cost-zero fallback. |
| Mid | `anthropic/claude-3-haiku` | More reliable on ambiguous screenshots; moderate cost. |
| Mid | `openai/gpt-4o-mini` | OpenAI alternative at low cost; good vision accuracy. |
| Capable | `anthropic/claude-sonnet-4-6` | High-confidence edge cases; only route here when mid-tier is uncertain. |
| Capable | `openai/gpt-4o` | Maximum capability; use only for ambiguous human-fallback triage. |

The default (`gemini-2.0-flash`) handles the vast majority of clear wallet/UI screenshots. The fallback chain catches provider outages or rate limits.

#### OpenRouter API Call Format

```typescript
// lib/quests/verification/vision/openrouter-client.ts

interface VisionCallOptions {
  model?: string;         // override default model for this call
  maxPricePrompt?: number;
  maxPriceCompletion?: number;
}

interface VisionResult {
  pass: boolean;
  confidence: number;   // 0.0 – 1.0, derived from model response
  reason: string;
}

async function callVisionModel(
  imageUrl: string,
  prompt: string,
  options?: VisionCallOptions
): Promise<VisionResult> {
  const primaryModel = options?.model
    ?? process.env.OPENROUTER_VISION_MODEL
    ?? 'google/gemini-2.0-flash';

  const fallbackModels = (process.env.OPENROUTER_VISION_FALLBACK_MODELS ?? '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);

  const body = {
    // Primary model + ordered fallback chain — OpenRouter tries each in sequence
    model: primaryModel,
    models: fallbackModels.length > 0
      ? [primaryModel, ...fallbackModels]
      : undefined,

    provider: {
      allow_fallbacks: true,
      // Optional cost ceiling — prevents accidentally routing to expensive models
      ...(options?.maxPricePrompt != null && {
        max_price: {
          prompt: options.maxPricePrompt,
          completion: options.maxPriceCompletion ?? options.maxPricePrompt * 2,
        },
      }),
    },

    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              // Supports: public URL or data URI (data:image/jpeg;base64,...)
              url: imageUrl,
            },
          },
        ],
      },
    ],

    // Ask the model to return structured JSON so confidence is machine-readable
    response_format: { type: 'json_object' },
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_APP_URL ?? '',
      'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'P2EInferno',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  // Model used (may differ from requested if fallback triggered)
  const modelUsed = data.model;
  const raw = JSON.parse(data.choices[0].message.content);
  // Expected model output shape: { pass: bool, confidence: float, reason: string }
  return { pass: raw.pass, confidence: raw.confidence, reason: raw.reason, modelUsed };
}
```

The prompt templates (section 6.2) instruct the model to respond with `{ "pass": true/false, "confidence": 0.0-1.0, "reason": "..." }` so the response is always machine-parseable regardless of which model was routed.

---

### 6.1 Strategy Interface

The existing `VerificationStrategy` interface accommodates this without changes. A new strategy class:

```typescript
// lib/quests/verification/ai-image-verification.ts
class AIImageVerificationStrategy implements VerificationStrategy {
  async verify(taskType, verificationData, userId, userAddress, options) {
    const imageUrl = verificationData.fileUrl;
    const aiReviewConfig = options?.taskConfig?.ai_review;
    const prompt = aiReviewConfig?.prompt_template;
    const threshold = aiReviewConfig?.confidence_threshold ?? 0.8;

    // Optional per-task model override (e.g. route a harder task to a better model)
    const modelOverride = aiReviewConfig?.model;

    const result = await callVisionModel(imageUrl, prompt, { model: modelOverride });
    // Returns: { pass: bool, confidence: float, reason: string, modelUsed: string }

    if (result.confidence >= threshold) {
      return {
        success: result.pass,
        verificationData: { modelUsed: result.modelUsed, reason: result.reason },
        error: result.pass ? undefined : result.reason,
      };
    }
    // Below threshold: fall back to human queue
    return { success: false, code: 'AI_UNCERTAIN', error: 'Flagged for human review' };
  }
}
```

The `model` field in `task_config.ai_review` is optional. When omitted, the global `OPENROUTER_VISION_MODEL` env var controls the model. This gives three levels of control:
1. **Global default** — env var, applies to all AI vision tasks
2. **Per-task override** — `task_config.ai_review.model` for tasks that need a stronger/cheaper model
3. **Fallback chain** — `OPENROUTER_VISION_FALLBACK_MODELS` for reliability if the primary is unavailable

---

### 6.2 Per-Task Vision Prompts (via `task_config.ai_review`)

`task_config.ai_review` shape:

```typescript
{
  prompt_template: string;           // required — task-specific instruction
  confidence_threshold?: number;     // default 0.8
  model?: string;                    // optional per-task OpenRouter model slug override
}
```

Prompt templates instruct the model to respond with strict JSON (`{ pass, confidence, reason }`). The system prompt can be set globally in `callVisionModel()` to enforce this format across all models.

| Task | Model recommendation | Prompt focus |
|------|---------------------|-------------|
| Install Self-Custody Wallet | Default (`gemini-2.0-flash`) | Verify screenshot shows a wallet app home screen (MetaMask/Rabby/Trust Wallet). A wallet address must be visible. The interface must match a known wallet UI pattern. Respond with `{"pass": bool, "confidence": 0.0-1.0, "reason": "..."}`. |
| Learn Mechanics I | Default | Verify screenshot shows DG Token Vendor at vendor.dreadgang.gg with the whitelisted NFT collections table visible. Respond with `{"pass": bool, "confidence": 0.0-1.0, "reason": "..."}`. |
| Learn Mechanics II | Default | Verify screenshot shows the Token Vendor Info / vendor details section with exchange rate and fee data visible. Respond with `{"pass": bool, "confidence": 0.0-1.0, "reason": "..."}`. |
| Learn Mechanics III | Default | Verify screenshot shows the power-up page with user stage, points, and fuel displayed. Respond with `{"pass": bool, "confidence": 0.0-1.0, "reason": "..."}`. |
| Learn Mechanics IV | Default | Verify screenshot shows the P2E Inferno vendor page (p2einferno.com/lobby/vendor) with the vendor interface loaded. Respond with `{"pass": bool, "confidence": 0.0-1.0, "reason": "..."}`. |

All tasks are appropriate for the budget default model. A per-task `model` override should only be set if a specific task proves problematic during testing.

---

### 6.3 Human Fallback

When AI confidence is below threshold, the submission stays in `pending` state and surfaces in the admin queue — exactly as today. This means the admin queue is not eliminated, it is dramatically reduced to only the edge cases and ambiguous submissions the AI cannot confidently resolve.

The `modelUsed` field is stored in `verification_data` so admins reviewing low-confidence submissions can see which model evaluated it and adjust model/threshold config accordingly.

---

## 7. Verification System Architecture — Updated

### 7.1 Updated `TaskType` Enum

```typescript
export type TaskType =
  // Existing automatic
  | "link_email" | "link_wallet" | "link_farcaster" | "link_telegram" | "sign_tos"
  | "vendor_buy" | "vendor_sell" | "vendor_light_up" | "vendor_level_up"
  | "deploy_lock" | "complete_external"
  // Existing manual (retain for backwards compat)
  | "submit_url" | "submit_text" | "submit_proof" | "custom"
  // New code-automated types
  | "eth_transfer"
  | "gas_drop"
  | "gooddollar_verified"
  | "in_app_pullout"
  | "youtube_subscribe"
  | "social_post";
```

### 7.2 Updated Verification Registry

```typescript
const strategies: Partial<Record<TaskType, VerificationStrategy>> = {
  // Existing
  vendor_buy: vendorStrategy,
  vendor_sell: vendorStrategy,
  vendor_light_up: vendorStrategy,
  vendor_level_up: vendorStrategy,
  deploy_lock: deployLockStrategy,
  // New code strategies
  eth_transfer: ethTransferStrategy,
  gas_drop: gasDropStrategy,
  gooddollar_verified: gooddollarVerifiedStrategy,
  in_app_pullout: inAppPulloutStrategy,
  youtube_subscribe: youtubeSubscribeStrategy,
  social_post: socialPostStrategy,
  // AI strategy (for submit_proof tasks with ai_review config)
  // Routes through OpenRouter — model controlled by OPENROUTER_VISION_MODEL env var
  // or per-task task_config.ai_review.model override
  submit_proof: aiImageStrategy,  // fallback to human queue if AI confidence < threshold
};
```

### 7.3 Decision Flow

```
User submits task
       ↓
complete-task.ts
       ↓
Has registered strategy?
  YES → run strategy.verify()
           ↓
        Code strategy (eth_transfer, gooddollar_verified, etc.)
           → deterministic → pass/fail immediately
        AI strategy (submit_proof with vision)
           → high confidence + pass  → completed
           → high confidence + fail  → failed (with AI reason as feedback)
           → low confidence          → pending (admin queue)
  NO  → requires_admin_review?
           YES → pending (full human review, legacy tasks)
           NO  → completed
```

---

## 8. Implementation Roadmap

### Phase 1 — Zero-Friction Wins (existing data, no new infrastructure)
These require no new external integrations. Data already exists.

1. `gooddollar_verified` — query `users.is_face_verified` (data already written by callback)
2. `in_app_pullout` — query `dg_token_withdrawals` (table already exists and populated)
3. `submit_text` proof code validation — add regex format check server-side

**Impact**: Eliminates manual review for "Complete Your GoodDollar Verification" and "Mission: Pullout".

### Phase 2 — Blockchain Verification (builds on existing viem/RPC infrastructure)
1. `eth_transfer` strategy — extend existing verification strategy pattern
2. `gas_drop` strategy — validate address + auto-trigger server-side ETH send

**Impact**: Eliminates manual review for "ETH is money" (Ether Flames), "Gas Drop", and "Find Your Transaction on the Block Explorer".

### Phase 3 — Social/Platform API Verification
1. `social_post` strategy — platform API clients for YouTube/Twitter/Farcaster
2. `youtube_subscribe` strategy — Google OAuth integration + YouTube Data API

**Impact**: Eliminates manual review for "Connect to DG Nation Broadcast" and "Show Others What's Possible".

### Phase 4 — AI Vision for Remaining Screenshots
1. `openrouter-client.ts` — provider-agnostic vision call via OpenRouter (single env var to switch models)
2. `AIImageVerificationStrategy` — wraps OpenRouter client; routes `submit_proof` tasks with `ai_review` config
3. Per-task prompt templates via `task_config.ai_review.prompt_template`
4. Confidence threshold → human fallback; `modelUsed` stored in `verification_data` for auditability

**Model choice**: Start with `google/gemini-2.0-flash` (cheap, fast, strong vision). Upgrade per-task via `task_config.ai_review.model` if needed. Set `OPENROUTER_VISION_FALLBACK_MODELS` for resilience.

**Impact**: Automates the 5 remaining screenshot tasks with AI, reducing human queue to only low-confidence edge cases. Switching to a different vision model requires zero code changes.

---

*Generated: 2026-02-26 | Source: Live admin panel review + codebase analysis + product reasoning*
