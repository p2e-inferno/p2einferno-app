# Check-in Streak Tracking Fix - Summary

## Problem Identified

Your daily check-in streak was showing 0 despite checking in for multiple consecutive days.

**Root Cause:** The streak calculation functions only queried the `attestations` table, but when `ENABLE_EAS` is disabled (default), check-ins are only recorded in the `user_activities` table. This caused a complete disconnect between check-in records and streak calculation.

## Solution Implemented

### 1. Fixed Database Constraints (Migration 095)

- **File:** `supabase/migrations/095_relax_attestation_address_validation.sql`
- **Issue:** Address validation was too strict (exact 42-character requirement)
- **Fix:** Changed to regex pattern validation that handles case-sensitivity

### 2. Added Dual-Source Streak Calculation (Migration 096)

- **File:** `supabase/migrations/096_add_user_activities_streak_calculation.sql`
- **Changes:**
  - Created `get_user_checkin_streak_from_activities(profile_id)` - calculates streaks from user_activities
  - Updated `get_user_checkin_streak(address)` - checks BOTH attestations AND user_activities
  - Updated `has_checked_in_today(address)` - checks both sources
  - Added performance index on user_activities table
  - Added helper function to map wallet addresses to profile IDs

### 3. Improved API Error Handling

- **File:** `pages/api/checkin/index.ts`
- **Changes:**
  - Added detailed logging for attestation inserts with address lengths
  - Normalized addresses to lowercase to prevent validation failures
  - Converted attestation failures from silent warnings to prominent error logs

## How the System Works Now

### Two Operating Modes

**Mode 1: EAS Disabled (Default - Database Only)**

- Check-ins recorded in `user_activities` table only
- Streak calculated from `user_activities`
- No on-chain attestations
- Faster, no wallet signing required for attestations

**Mode 2: EAS Enabled (On-chain Attestations)**

- Check-ins recorded in BOTH `user_activities` AND `attestations`
- Streak calculated from `attestations` (preferred) with fallback to `user_activities`
- On-chain attestations created via Ethereum Attestation Service
- Requires `NEXT_PUBLIC_ENABLE_EAS=true` and valid 64-char hex schema UID

### Smart Fallback Logic

The database functions now use intelligent fallback:

```
1. Check if user has ANY attestations
2. If YES → use attestation-based streak calculation
3. If NO → use user_activities-based streak calculation
4. Return streak count
```

This ensures:

- ✅ Backward compatibility with existing users who have attestations
- ✅ Forward compatibility when EAS is enabled in the future
- ✅ Streaks work correctly regardless of EAS mode
- ✅ No data loss or migration required

## Testing Instructions

### Quick Test (EAS Disabled Mode)

1. **Start your dev environment:**

   ```bash
   npm run dev
   ```

2. **Login and check in:**

   - Navigate to the lobby page
   - Click "Check in" button
   - **Expected:** Success message, XP awarded

3. **Verify streak increments:**

   - Check the streak counter on the UI
   - **Expected:** Shows "1 day" or "1"

4. **Check again tomorrow (or simulate):**

   - Wait until UTC midnight or test with date manipulation
   - Click "Check in" again
   - **Expected:** Streak shows "2 days" or "2"

5. **Check database records:**
   ```sql
   -- Should see your check-ins here
   SELECT * FROM user_activities
   WHERE activity_type = 'daily_checkin'
   ORDER BY created_at DESC;
   ```

### Verify the Fix

Check your server logs for these indicators of success:

**✅ Good signs:**

```
INFO: Inserting attestation (with attesterLength: 42, recipientLength: 42)
INFO: Attestation inserted successfully
INFO: Applied XP via API
```

**❌ Bad signs (should NOT appear anymore):**

```
ERROR: Failed to insert attestation row - STREAK TRACKING BROKEN
WARN: No attestation data provided - streak tracking may not work
```

### Test Streak Calculation Directly

You can test the database function directly using SQL:

```sql
-- Replace with your wallet address
SELECT get_user_checkin_streak('0xYourWalletAddressHere');
-- Should return your current streak count

-- Check if you've checked in today
SELECT has_checked_in_today('0xYourWalletAddressHere');
-- Should return true if you checked in today, false otherwise
```

## What Changed in the Code

### Database Layer

- ✅ 2 new migrations applied
- ✅ 4 database functions created/updated
- ✅ 1 performance index added
- ✅ All functions secured with `SECURITY DEFINER` and fixed `search_path`

### API Layer

- ✅ Enhanced logging in `/api/checkin`
- ✅ Address normalization (lowercase)
- ✅ Better error messages

### No Changes Required In

- ❌ Frontend components (they already work correctly)
- ❌ React hooks (they call the right backend functions)
- ❌ Client-side streak calculator (uses DB functions)

## Environment Variables Reference

### Current Configuration (EAS Disabled)

```bash
# In your .env.local
# NEXT_PUBLIC_ENABLE_EAS is not set (or set to false)
# NEXT_PUBLIC_DAILY_CHECKIN_SCHEMA_UID=0xp2e_daily_checkin_001 (placeholder, not hex)
```

This is the **recommended default** for development and production until you're ready to deploy on-chain attestations.

### Future Configuration (EAS Enabled)

```bash
# When you deploy your schema to Base Sepolia
NEXT_PUBLIC_ENABLE_EAS=true
NEXT_PUBLIC_DAILY_CHECKIN_SCHEMA_UID=0x1234567890abcdef... # 64-char hex
```

## Next Steps

1. **Test the fix** following the instructions above
2. **Check in for 2-3 consecutive days** to verify streaks increment
3. **Check the documentation** in `docs/checkin-streak-tracking-fix.md` for full details
4. **Review logs** to ensure attestations are being handled correctly (even if not created on-chain)

## Rollback (If Needed)

The migrations are backward compatible and safe:

- Old data is not modified
- Functions gracefully handle both data sources
- No breaking changes to the API

If you need to rollback:

```bash
# Revert last 2 migrations
supabase migration down --version 2
```

## Success Criteria

After this fix, you should see:

- ✅ Streak counter increments each day you check in
- ✅ Streak resets to 1 if you miss a day
- ✅ Check-in button shows correct state (checked in today vs available)
- ✅ XP is awarded correctly on each check-in
- ✅ No "STREAK TRACKING BROKEN" errors in server logs

## Questions?

If the streak still shows 0 after this fix:

1. **Check your wallet address is consistent** (same wallet each time)
2. **Check server logs** for any errors during check-in
3. **Verify user_activities table** has your check-in records
4. **Confirm UTC timezone** for date comparison (check-ins reset at UTC midnight)

Refer to `docs/checkin-streak-tracking-fix.md` for comprehensive troubleshooting steps.
