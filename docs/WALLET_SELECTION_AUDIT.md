# Wallet Selection Multi-Wallet Support Audit

**Issue**: App has both embedded and external wallets, but many code paths use `wallets[0]` or stale `wallet_address` from database, causing mismatches when users switch between wallets.

**Root Cause**: Lack of unified wallet selection logic across client and server.

**Solution**:
- **Client**: Use `useSmartWalletSelection()` hook everywhere
- **Server (Attestation flows)**: Use `extractAndValidateWalletFromSignature()` utility
- **Server (Non-attestation flows)**: Use `extractAndValidateWalletFromHeader()` utility

## 📊 Audit Summary

### Overall Status
- **Total Issues Found**: 45+
- **Fixed**: 22 (19 high-priority + 3 admin session)
- **High Priority (Attestation/Claims)**: 20
- **Medium Priority (Hooks/Utils)**: 7
- **Critical (Admin Session)**: 3 verified/fixed
- **Under Investigation**: 14

### Affected Systems
1. ✅ **Quest Rewards** - 5/5 fixed
2. ✅ **Milestone Claims** - 4/4 fixed
3. ✅ **Bootcamp Certificates** - 2/2 fixed
4. ✅ **Admin Session** - 3/3 fixed (session creation + validation + client hook verified)
5. ✅ **XP Renewal** - 2/2 fixed
6. ✅ **Check-ins** - 2/2 fixed
7. ✅ **Token Withdrawal** - 3/3 fixed (client hook verified + 2 server endpoints)
8. 🔍 **Various Hooks** - 0/7 fixed

---

## ✅ Unified Utilities Created

### Client-Side
- **Hook**: `useSmartWalletSelection()` - [hooks/useSmartWalletSelection.tsx](hooks/useSmartWalletSelection.tsx)
- **Purpose**: Prioritizes external wallet over embedded, respects device availability
- **Returns**: Currently connected wallet with proper prioritization

### Server-Side (DRY Architecture)

**Core Validation Helper** (Shared by both utilities below):
- **Function**: `validateWalletOwnership()` - [lib/auth/privy.ts:72](lib/auth/privy.ts#L72)
- **Purpose**: Validates wallet belongs to user's linked accounts (eliminates duplication)
- **Internal use only**: Called by the two utilities below

**For Attestation Flows** (quests, milestones, certificates, etc.):
- **Utility**: `extractAndValidateWalletFromSignature()` - [lib/attestation/api/helpers.ts:249](lib/attestation/api/helpers.ts#L249)
- **Purpose**: Extracts wallet from attestation signature, validates ownership
- **When to use**: Flows where client signs an attestation (EAS-enabled)
- **Returns**: Validated wallet address from signature

**For Non-Attestation Flows** (sessions, grants, etc.):
- **Utility**: `extractAndValidateWalletFromHeader()` - [lib/auth/privy.ts:106](lib/auth/privy.ts#L106)
- **Purpose**: Extracts wallet from X-Active-Wallet header, validates ownership
- **When to use**: Flows without attestations (admin sessions, key grants, etc.)
- **Returns**: Validated wallet address from header

---

## 📋 Code Paths Requiring Fixes

### Category 1: Claim/Attestation Flows (HIGH PRIORITY)

#### Quest Flows
| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `pages/lobby/quests/[id].tsx` | **FIXED** | 325 | Used `wallets[0]` | Replaced with `useSmartWalletSelection()` |
| ✅ `pages/api/quests/claim-task-reward.ts` | **FIXED** | 97-106 | Inline validation | Using `extractAndValidateWalletFromSignature()` |
| ✅ `pages/api/quests/get-trial.ts` | **FIXED** | 208 | Used DB `wallet_address` | Using `extractAndValidateWalletFromSignature()` + `extractAndValidateWalletFromHeader()` |
| ✅ `pages/api/quests/commit-completion-attestation.ts` | **FIXED** | 52 | Used DB `wallet_address` | Using `extractAndValidateWalletFromSignature()` |
| ✅ `hooks/useQuests.ts` | **FIXED** | 189, 304 | Uses `wallets[0]` | Replaced with `useSmartWalletSelection()` |

#### Milestone Flows
| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `components/lobby/MilestoneTaskClaimButton.tsx` | **FIXED** | 65, 68 | Used `wallets[0]` | Replaced with `useSmartWalletSelection()` |
| ✅ `pages/api/user/task/[taskId]/claim.ts` | **FIXED** | 111-114 | Used DB `wallet_address` | Using `extractAndValidateWalletFromSignature()` |
| ✅ `pages/api/milestones/claim.ts` | **FIXED** | 106, 115 | Used DB `wallet_address` | Using `extractAndValidateWalletFromSignature()` + `extractAndValidateWalletFromHeader()` |
| ✅ `hooks/useMilestoneClaim.tsx` | **OK** | 34 | Already using smart selection | Already uses `useSmartWalletSelection()` |

#### Bootcamp/Certificate Flows
| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `pages/api/bootcamp/certificate/claim.ts` | **FIXED** | 287, 452 | Used DB `wallet_address` | Using `extractAndValidateWalletFromSignature()` + `extractAndValidateWalletFromHeader()` (required: true) |
| ✅ `hooks/bootcamp-completion/useCertificateClaim.ts` | **OK** | N/A | Gets payload from server | Server fix needed only (now complete) |

#### Subscription/XP Renewal Flows
| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `hooks/useXpRenewal.ts` | **FIXED** | 137 | Uses `wallets?.[0]` | Replaced with `useSmartWalletSelection()` |
| ✅ `pages/api/subscriptions/commit-renewal-attestation.ts` | **FIXED** | 44-80 | Used old getPrivyUser pattern | Using `extractAndValidateWalletFromSignature()` |

#### Check-in Flow
| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `pages/api/checkin/index.ts` | **FIXED** | 71-109 | Used DB `wallet_address` (5 places) | Using `extractAndValidateWalletFromHeader()` + `validateWalletOwnership()` |
| ✅ `hooks/checkin/useDelegatedAttestationCheckin.ts` | **FIXED** | 71 | Uses `wallets?.[0]` | Replaced with `useSmartWalletSelection()` |

#### Token Withdrawal Flow
| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `hooks/useDGWithdrawal.ts` | **OK** | 70 | Uses `usePrivyWriteWallet()` | Already uses `useSmartWalletSelection()` internally |
| ✅ `app/api/token/withdraw/route.ts` | **FIXED** | 79-89 | No wallet validation | Added `validateWalletOwnership()` after request parsing |
| ✅ `app/api/token/withdraw/commit-attestation/route.ts` | **FIXED** | 111-141 | Used DB `wallet_address` | Using `extractAndValidateWalletFromSignature()` + wallet match validation |

### Category 2: Admin Session Validation (CRITICAL)

| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `app/api/admin/session/route.ts` | **FIXED** | 102 | Used `walletAddresses[0]` fallback | Using `extractAndValidateWalletFromHeader()` with `required: true` (strict, no fallback) |
| ✅ `lib/auth/admin-auth.ts` | **OK** | 139, 164 | Strict wallet equality check | Correct - ensures session wallet matches active wallet, prevents hijacking |
| ✅ `hooks/useAdminSession.ts` | **OK** | 140, 152 | Sends `X-Active-Wallet` header | Already uses `useSmartWalletSelection()` correctly |

### Category 3: Hook/Utility Wallet Access (MEDIUM PRIORITY)

| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `hooks/attestation/useGaslessAttestation.ts` | **FIXED** | 129 | Used manual filtering causing potential fallback issues | Replaced with `useSmartWalletSelection()` + address matching |
| ✅ `hooks/useAdminSignedAction.ts` | **VERIFIED** | 108 | Uses `wallets[0]` as last resort | Correctly prioritizes `selectedWallet` via `useSmartWalletSelection()` |
| ✅ `hooks/useTOSSigning.ts` | **FIXED** | 16, 36 | Uses `wallets[0]` | Replaced with `useSmartWalletSelection()` |
| ✅ `hooks/useAddDGTokenToWallet.ts` | **FIXED** | 24 | Uses `wallets[0]` | Replaced with `useSmartWalletSelection()` + address matching |
| ✅ `hooks/useDGNationKey.ts` | **FIXED** | 40 | Uses `wallets[0]` | Replaced with `useSmartWalletSelection()` |
| ✅ `hooks/attestation/useAttestations.ts` | **FIXED** | 29, 61, 89 | Uses `wallets[0]` | Replaced with `useSmartWalletSelection()` + address matching |
| ✅ `hooks/attestation/useAttestationQueries.ts` | **FIXED** | 61, 149 | Uses `wallets[0]` | Replaced with `useSmartWalletSelection()` fallback chain |

### Category 4: Library/Internal Code (LOW PRIORITY - Reviewed)

| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `hooks/usePrivyWagmi.ts` | **FIXED** | 44 | Uses `wallets[0]` | Updated to use `useSmartWalletSelection()` for consistency |
| 🔍 `hooks/unlock/usePrivyWriteWallet.ts` | **OK** | 26 | Uses `wallets[0]` | Intentional: Already prioritizes `smartWallet` before fallback |
| 🔍 `lib/unlock/lockUtils.ts` | **OK** | N/A | Utility function | Safe: Operates on passed wallet argument |
| 🔍 `lib/blockchain/shared/client-utils.ts` | **OK** | N/A | Utility function | Safe: Operates on passed wallet argument |
| ✅ `lib/gooddollar/use-identity-sdk.ts` | **FIXED** | 28 | Uses `wallets[0]` | Updated to use `useSmartWalletSelection()` for consistency |

### Category 5: Server-Side DB Wallet Access (NEEDS INVESTIGATION)

| File | Status | Lines | Issue | Fix |
|------|--------|-------|-------|-----|
| ✅ `pages/api/checkin/index.ts` | **FIXED** | 71-109 | Used DB `wallet_address` | Using `extractAndValidateWalletFromHeader()` + signature validation |
| ✅ `pages/api/payment/verify/[reference].ts` | **FIXED** | 186 | Trusted DB `wallet_address` | Added `validateWalletOwnership()` before key grant |
| ✅ `pages/api/gooddollar/verify-callback.ts` | **VERIFIED** | 120 | Manual wallet iteration | retained original implementation (efficient & correct) |
| ✅ `pages/api/quests/sign-tos.ts` | **FIXED** | 27 | No ownership validation | Added `validateWalletOwnership()` |
| ✅ `pages/api/user/profile.ts` | **FIXED** | 59 | Blindly updated wallet | Added `validateWalletOwnership()` before profile upsert |

---

## 🎯 Implementation Plan

### Phase 1: Critical Admin Session Fix ✅ COMPLETE
**User was experiencing "Session wallet mismatch" error**

1. ✅ Identified: Admin session created with `walletAddresses[0]` (embedded)
2. ✅ Identified: Client sends `X-Active-Wallet` from `useSmartWalletSelection()` (external)
3. ✅ **FIXED**: `app/api/admin/session/route.ts` now uses `extractAndValidateWalletFromHeader()` with `required: true` (strict, no fallback)
4. ✅ **VERIFIED**: `lib/auth/admin-auth.ts` strict equality check is correct (prevents session hijacking)
5. ✅ **VERIFIED**: `hooks/useAdminSession.ts` sends X-Active-Wallet header using `useSmartWalletSelection()`

**Files fixed/verified**:
- ✅ `app/api/admin/session/route.ts` (line 102) - Strict validation, no fallback
- ✅ `lib/auth/admin-auth.ts` (lines 139, 164) - Correct validation logic
- ✅ `hooks/useAdminSession.ts` (lines 140, 152) - Correct client implementation

**Note**: `lib/auth/route-handlers/admin-guard.ts` removed from scope - similar pattern to admin-auth.ts

### Phase 2: High-Priority Attestation/Claim Flows
**Systematic fix of all claim flows to prevent runtime errors**

#### 2a. Milestone Flows (4 files)
1. `components/lobby/MilestoneTaskClaimButton.tsx` - client
2. `pages/api/user/task/[taskId]/claim.ts` - server (task reward)
3. `pages/api/milestones/claim.ts` - server (achievement)
4. `hooks/useMilestoneClaim.tsx` - hook

#### 2b. Bootcamp/Certificate Flows (2 locations in 1 file)
1. `pages/api/bootcamp/certificate/claim.ts` (lines 316, 484)

#### 2c. XP Renewal Flow (2 files)
1. `hooks/useXpRenewal.ts` - client
2. `pages/api/subscriptions/commit-renewal-attestation.ts` - server

#### 2d. Check-in Flow (2 files)
1. `pages/api/checkin/index.ts` - server (5 locations)
2. `lib/checkin/core/service.ts` - service layer

#### 2e. Remaining Quest Flows (3 files)
1. `hooks/useQuests.ts` (lines 189, 304)
2. `pages/api/quests/get-trial.ts`
3. `pages/api/quests/commit-completion-attestation.ts`

#### 2f. Token Withdrawal Flow (3 files)
1. `hooks/useDGWithdrawal.ts` - client
2. `app/api/token/withdraw/route.ts` - server
3. `app/api/token/withdraw/commit-attestation/route.ts` - server

### Phase 3: Utility Hooks (MEDIUM PRIORITY)
**Fix non-critical hooks to prevent future issues**

1. `hooks/useAdminSignedAction.ts`
2. `hooks/useTOSSigning.ts`
3. `hooks/useAddDGTokenToWallet.ts`
4. `hooks/useDGNationKey.ts`
5. `hooks/attestation/useGaslessAttestation.ts`
6. `hooks/attestation/useAttestations.ts`
7. `hooks/attestation/useAttestationQueries.ts`

### Phase 4: Investigation & Documentation
**Understand edge cases and low-level utilities**

1. `hooks/usePrivyWagmi.ts` - Privy integration wrapper
2. `hooks/unlock/usePrivyWriteWallet.ts` - Unlock integration
3. `lib/unlock/lockUtils.ts` - Low-level lock utilities
4. `lib/blockchain/shared/client-utils.ts` - Blockchain utilities
5. `lib/gooddollar/use-identity-sdk.ts` - GoodDollar SDK wrapper
6. Document which uses of `wallets[0]` are intentional vs. bugs

---

## 🧪 Testing Checklist

For each fixed code path, test:
- [ ] User with embedded wallet only
- [ ] User with external wallet only
- [ ] User with both wallets, external active
- [ ] User with both wallets, embedded active
- [ ] User switching between wallets mid-session
- [ ] User on mobile without external wallet available

---

## 📝 Notes

- **Admin Session Issue**: Most likely caused by client sending wrong wallet in `X-Active-Wallet` header. Need to trace where this header is set.
- **Signature-based validation**: Only applicable to attestation flows where client signs. Other flows may legitimately use DB wallet.
- **Database wallet_address field**: Consider deprecating or making it read-only, populated by Privy webhooks for reference only.
