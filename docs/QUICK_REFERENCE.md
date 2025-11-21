# Subscription Renewal - Quick Reference Card

**Print this or pin to your monitor during development**

---

## The 3 Renewal Pathways

| Pathway | User Action | Cost | Server Does | Complexity |
|---------|-------------|------|-------------|-----------|
| **XP** | Spends earned XP | Base + 1% fee | Deducts XP + extends key | Medium |
| **Crypto** | Signs transaction | ETH/USDC | Watches for confirmation | Low |
| **Paystack** | Pays with card | NGN (Phase 2) | Webhooks + extends key | High |

---

## Service Fees (XP Only)

```
Base cost = 100 XP
Service fee % = 1% (configurable, min 0.5%, max 3%)
Service fee = 100 × 1% = 1 XP
Total from user = 101 XP

↓
User XP: -101
Treasury XP: +1
Key: Extended
```

---

## Critical Database Functions

### `deduct_xp_for_renewal(user_id, base_xp, fee_xp, attempt_id)`
```sql
-- ATOMIC: All three must succeed together
1. Deduct total XP from user
2. Accumulate fee to treasury
3. Create renewal attempt record
-- If any fail: entire transaction rolls back
```

### `rollback_xp_renewal(attempt_id, reason)`
```sql
-- If extend() fails AFTER XP deducted
1. Restore XP to user
2. Log rollback (audit trail)
3. Update renewal status = 'reverted'
-- Treasury fee is NOT rolled back (intentional)
```

### `burn_subscription_treasury(amount, admin_id, reason, details)`
```sql
-- Admin can "burn" (delete) accumulated fees
1. Deduct from treasury
2. Add to burned counter
3. Log with admin ID + reason
```

---

## API Response Format

All endpoints follow this pattern:

```typescript
{
  success: boolean;          // Always present
  data?: { ... };            // Present if success=true
  error?: string;            // Present if success=false
  recovery?: { ... };        // Present if retryable error
}
```

---

## User Flows (Exact Steps)

### XP Renewal Flow
```
1. Dashboard shows "Renew Subscription" button + days remaining
2. User clicks → XP Renewal Modal opens
3. Modal fetches quote (GET /xp-renewal-quote)
4. Shows: "Base: 100 XP, Fee: 1 XP, Total: 101 XP needed"
5. User clicks "Renew Now" (if has 101 XP)
6. Server POST /renew-with-xp:
   a. Create renewal_attempt (status='pending')
   b. Call deduct_xp_for_renewal() - ATOMIC
   c. If fails: return error with recovery info
   d. Call lock.extend() - server-side using service wallet
   e. If fails: call rollback_xp_renewal()
   f. If succeeds: update all records, return success
7. Modal shows "✅ Renewed! Expires: Dec 20, 2025"
```

### Crypto Renewal Flow
```
1. Dashboard shows "Renew with Crypto" button
2. User clicks → Crypto Renewal Modal opens
3. Modal shows cost for durations (1mo, 3mo, 1yr)
4. User selects duration + clicks "Renew Now"
5. User's wallet pops up to sign extend() transaction
6. Transaction submitted to blockchain
7. Server waits for confirmation (2 blocks)
8. Modal shows "✅ Renewed! Expires: Dec 20, 2025"
```

### Admin Treasury Flow
```
1. Admin goes to /admin/subscriptions/treasury
2. Sees: "Treasury Balance: 523 XP | Burned: 1050 XP"
3. Sees burn history table (who, when, reason)
4. Clicks "Burn Fees" button
5. Modal asks: "Amount? Reason?"
6. Confirms
7. Server calls burn_subscription_treasury()
8. Burn logged in audit table
9. Treasury balance updates
```

---

## Key Implementation Gotchas

### ⚠️ Service Fee is Separate Parameter
```typescript
// RIGHT
deduct_xp_for_renewal(userId, baseCost=100, serviceFee=1, attemptId)

// WRONG (no separate fee)
deduct_xp_for_renewal(userId, total=101, attemptId)
```

### ⚠️ XP Deduction is ATOMIC
```sql
-- Must succeed or fail TOGETHER
UPDATE user_profiles SET experience_points = ...
UPDATE subscription_treasury SET xp_fees_accumulated = ...
UPDATE subscription_renewal_attempts SET status = ...
-- If any fails, all roll back
```

### ⚠️ Treasury Fee Never Rolls Back
```
Scenario: User renews, XP deducted, extend() fails
Result:
- User XP: RESTORED (rolled back)
- Treasury fee: KEPT (not rolled back)
```

### ⚠️ Service Wallet Must Be Configured
```typescript
// Renewal uses pre-configured service wallet to extend key
// This wallet must exist and have funds
// Check: pages/api/subscriptions/renew-with-xp.ts
```

### ⚠️ Three Separate Modal Components
```
Don't build "one modal with tabs"
Build three separate components:
- CryptoRenewalModal.tsx
- XpRenewalModal.tsx
- PaystackRenewalModal.tsx (Phase 2)

Each is independent and self-contained
```

---

## File Paths (Quick Lookup)

**Database**:
- Migration: `supabase/migrations/###_subscription_renewal_foundation.sql`

**Helpers**:
- Calculations: `lib/helpers/xp-renewal-helpers.ts`

**API**:
- GET quote: `pages/api/subscriptions/xp-renewal-quote.ts`
- POST renew: `pages/api/subscriptions/renew-with-xp.ts`
- GET status: `pages/api/subscriptions/renewal-status.ts`

**Hooks**:
- XP renewal: `hooks/useXpRenewal.ts`
- Status: `hooks/useRenewalStatus.ts`
- Extend key: `hooks/unlock/useExtendKey.ts`

**Components**:
- Dashboard card: `components/subscription/SubscriptionStatusCard.tsx`
- XP modal: `components/subscription/XpRenewalModal.tsx`
- Crypto modal: `components/subscription/CryptoRenewalModal.tsx`

**Admin**:
- Treasury: `pages/admin/subscriptions/treasury.tsx`
- Renewals: `pages/admin/subscriptions/renewal-attempts.tsx`
- Config: `pages/admin/subscriptions/fee-settings.tsx`
- Metrics: `pages/admin/subscriptions/metrics.tsx`

---

## Testing Checklist (Before Commit)

```
[ ] DB migrations apply cleanly
[ ] All RPC functions tested (success + error cases)
[ ] API endpoints return correct responses
[ ] XP deduction is atomic (no partial updates)
[ ] Rollback works (XP restored on extend() failure)
[ ] Treasury accumulates fees correctly
[ ] UI shows correct costs
[ ] Renewal succeeds on testnet
[ ] Error recovery works
[ ] No console errors
[ ] Admin can burn fees
```

---

## Common Issues & Solutions

**Issue**: XP deducted but key not extended
**Solution**: Check rollback_xp_renewal() was called. Treasury fee should still be kept.

**Issue**: Treasury fee never accumulates
**Solution**: Check deduct_xp_for_renewal() is updating subscription_treasury table.

**Issue**: User can't retry failed renewal
**Solution**: Check renewal_attempt record has correct ID. Check recovery response is sent.

**Issue**: Service fee appears in user deduction but not in treasury
**Solution**: Check RPC function is atomic. If any part fails, entire transaction rolls back.

**Issue**: Admin can't burn more than available
**Solution**: Check validation in burn_subscription_treasury(). Min check: if amount > balance, error.

---

## Performance Notes

**GET /xp-renewal-quote**:
- Fetch user XP: Fast (indexed lookup)
- Fetch lock keyPrice: RPC call (~100ms)
- Calculate costs: < 1ms
- Total: < 200ms

**POST /renew-with-xp**:
- Validation: < 50ms
- Create renewal_attempt: < 10ms
- deduct_xp_for_renewal() RPC: < 50ms
- extend() transaction: 10-30s (blockchain)
- Confirm receipt: 30-60s (blockchain)
- Total: 40-90s (mostly blockchain)

**Admin endpoints**:
- Pagination: Always use limit=50
- Burn history: Cache for 1 minute
- Metrics: Cache for 5 minutes

---

## Environment Variables Needed

```bash
# Service wallet for renewal extensions
RENEWAL_SERVICE_WALLET_ADDRESS=0x...
RENEWAL_SERVICE_WALLET_PRIVATE_KEY=0x... # ⚠️ SECURE!

# Lock addresses
NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS=0x... # Mainnet
NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS_TESTNET=0x... # Testnet

# Service fee defaults
SUBSCRIPTION_XP_SERVICE_FEE_PERCENT=1.0 # 1%
SUBSCRIPTION_XP_SERVICE_FEE_MIN_PERCENT=0.5 # 0.5%
SUBSCRIPTION_XP_SERVICE_FEE_MAX_PERCENT=3.0 # 3%
```

---

## Debugging Commands

**Check renewal attempt**:
```sql
SELECT * FROM subscription_renewal_attempts
WHERE user_id = 'user123'
ORDER BY created_at DESC
LIMIT 5;
```

**Check treasury**:
```sql
SELECT * FROM subscription_treasury;
```

**Check treasury burns**:
```sql
SELECT * FROM subscription_treasury_burns
ORDER BY created_at DESC;
```

**Check rollbacks**:
```sql
SELECT * FROM subscription_xp_rollbacks
WHERE renewal_attempt_id = 'attempt-id';
```

---

## Emergency Procedures

**If treasury fee is stuck**:
1. Check deduct_xp_for_renewal() RPC is being called
2. Verify transaction committed (check DB)
3. Manual fix: UPDATE subscription_treasury SET xp_fees_accumulated = correct_value

**If user XP is wrong**:
1. Check user_profiles.experience_points
2. Check all activities (quest rewards, withdrawals, renewals)
3. If error is from renewal: call rollback_xp_renewal() with correct attemptId

**If key not extended but XP deducted**:
1. Check renewal_attempt status (should be 'reverted')
2. Verify XP was restored
3. Check error message in renewal_attempt.error_message
4. User can retry

---

## Daily Standup Talking Points

**What's working**:
- [ ] All database functions atomic?
- [ ] API endpoints return correct data?
- [ ] UI components render correctly?
- [ ] Tests passing?

**What's blocked**:
- [ ] Need testnet lock address?
- [ ] Need service wallet setup?
- [ ] Need admin dashboard design approval?

**What's next**:
- [ ] Next task from RENEWAL_SPRINT_TASKS.md
- [ ] Any blockers to resolve?
- [ ] Any PRs to review?

---

**Good luck! Reference this card during development.** 🚀
