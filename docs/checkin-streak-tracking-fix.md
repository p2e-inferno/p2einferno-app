# Daily Check-in Streak Tracking Fix

## Issue Summary

Users reported that daily check-in streaks were not being tracked properly. After checking in for multiple consecutive days, the streak counter remained at 0.

## Root Cause Analysis

The system has two modes of operation controlled by the `NEXT_PUBLIC_ENABLE_EAS` / `ENABLE_EAS` environment variable:

### Mode 1: EAS Enabled (On-chain Attestations)

- Check-ins create on-chain attestations via Ethereum Attestation Service
- Attestations are stored in the `attestations` table
- Schema UID: `0xp2e_daily_checkin_001` (or custom from env)

### Mode 2: EAS Disabled (Database-only)

- Check-ins skip on-chain attestations
- Check-ins are only recorded in the `user_activities` table
- No records in `attestations` table

### The Problem

The streak calculation functions **always queried the `attestations` table**, regardless of whether EAS was enabled:

```sql
-- Original get_user_checkin_streak() - ONLY checks attestations
SELECT 1 FROM public.attestations
WHERE recipient = user_address
  AND schema_uid = '0xp2e_daily_checkin_001'
  AND is_revoked = false
  AND DATE(created_at) = current_date_check
```

**Result:** When EAS was disabled, no attestations existed, so streaks always returned 0.

## The Fix

We implemented a multi-layered solution:

### 1. Database Schema Fix (Migration 095)

**File:** `supabase/migrations/095_relax_attestation_address_validation.sql`

**Problem:** Overly strict address validation constraints prevented attestation inserts:

```sql
-- Old constraint
CONSTRAINT valid_attester_address CHECK (length(attester) = 42)
```

**Solution:** More flexible regex-based validation:

```sql
-- New constraint
CONSTRAINT valid_attester_address CHECK (
  attester ~ '^0x[a-fA-F0-9]{40}$'
)
```

This handles case-sensitivity issues while still validating proper Ethereum address format.

### 2. Dual-Source Streak Calculation (Migration 096)

**File:** `supabase/migrations/096_add_user_activities_streak_calculation.sql`

Created functions to support both EAS and non-EAS modes:

#### New Function: `get_user_checkin_streak_from_activities(profile_id UUID)`

Calculates streaks from the `user_activities` table:

```sql
SELECT 1 FROM public.user_activities
WHERE user_profile_id = profile_id
  AND activity_type = 'daily_checkin'
  AND DATE(created_at) = current_date_check
```

#### Updated Function: `get_user_checkin_streak(user_address TEXT)`

Now checks both sources intelligently:

1. First checks if any attestations exist for the user
2. If attestations exist → use attestation-based calculation (EAS mode)
3. If no attestations → use activities-based calculation (non-EAS mode)

This ensures backward compatibility while supporting both modes.

#### Updated Function: `has_checked_in_today(user_address TEXT)`

Similarly updated to check both sources:

1. Check attestations first
2. If no attestation found, check user_activities
3. Return true if either source has a check-in for today

#### Helper Function: `get_user_profile_id_from_address(wallet_addr TEXT)`

Maps wallet addresses to user profile IDs for querying user_activities.

### 3. Improved API Error Handling

**File:** `pages/api/checkin/index.ts`

**Enhanced logging:**

- Added detailed logging for attestation inserts
- Logs address lengths and normalization
- Surfaces critical errors with context
- Warns when attestation data is missing

**Address normalization:**

```typescript
const normalizedAttester = attestation.attester?.toLowerCase() || "";
const normalizedRecipient = attestation.recipient?.toLowerCase() || "";
```

Ensures consistent address formatting to prevent validation failures.

### 4. Performance Optimization

Added composite index for faster streak queries:

```sql
CREATE INDEX idx_user_activities_checkin_date
  ON public.user_activities(user_profile_id, activity_type, created_at)
  WHERE activity_type = 'daily_checkin';
```

## How It Works Now

### Check-in Flow

```
User clicks "Check In"
         ↓
Frontend: useDailyCheckin hook
         ↓
Service: DailyCheckinService.performCheckin()
         ↓
┌────────────────────────────────┐
│ Create Attestation (if EAS on) │
│ - Uses AttestationService      │
│ - Creates on-chain if hex UID  │
│ - Generates temp UID if not    │
└────────────────────────────────┘
         ↓
API: POST /api/checkin
         ↓
┌─────────────────────────────────┐
│ 1. Update user XP               │
│ 2. Insert user_activities row   │ ← ALWAYS happens
│ 3. Insert attestation (if data) │ ← Only if EAS enabled
└─────────────────────────────────┘
```

### Streak Calculation Flow

```
Frontend: useStreakData hook
         ↓
Service: StreakCalculator.calculateStreak()
         ↓
Database: get_user_checkin_streak(address)
         ↓
┌──────────────────────────────┐
│ Check if attestations exist  │
└──────────────────────────────┘
         ↓
    ┌────┴────┐
    │         │
  YES        NO
    │         │
    │         ↓
    │    ┌──────────────────────────┐
    │    │ Query user_activities    │
    │    │ (Non-EAS mode)           │
    │    └──────────────────────────┘
    ↓
┌──────────────────────────┐
│ Query attestations       │
│ (EAS mode)               │
└──────────────────────────┘
    │
    └────┬────┘
         ↓
    Return streak count
```

## Testing Checklist

### EAS Disabled Mode (Current Default)

- [ ] Check in for Day 1 → Streak shows 1
- [ ] Check in for Day 2 → Streak shows 2
- [ ] Check in for Day 3 → Streak shows 3
- [ ] Skip Day 4 → Streak resets to 0
- [ ] Check in for Day 5 → Streak shows 1
- [ ] Verify `user_activities` table has records
- [ ] Verify `attestations` table is empty or has non-checkin records

### EAS Enabled Mode (With Valid Schema UID)

- [ ] Set `NEXT_PUBLIC_ENABLE_EAS=true`
- [ ] Set `NEXT_PUBLIC_DAILY_CHECKIN_SCHEMA_UID=0x[64-char-hex]`
- [ ] Check in for Day 1 → Streak shows 1, attestation created
- [ ] Check in for Day 2 → Streak shows 2, attestation created
- [ ] Verify both `user_activities` AND `attestations` have records
- [ ] Verify addresses are lowercase in attestations table

### API Error Handling

- [ ] Check server logs for "Inserting attestation" messages
- [ ] Verify no "STREAK TRACKING BROKEN" errors in logs
- [ ] Confirm "Attestation inserted successfully" on each check-in

## Environment Variables

### Required for EAS Mode

```bash
# Enable on-chain attestations
NEXT_PUBLIC_ENABLE_EAS=true

# Valid 32-byte hex schema UID (deployed on Base Sepolia)
NEXT_PUBLIC_DAILY_CHECKIN_SCHEMA_UID=0x1234...abcd

# Or use separate env for server-side
ENABLE_EAS=true
DAILY_CHECKIN_SCHEMA_UID=0x1234...abcd
```

### Database-only Mode (Default)

```bash
# Leave EAS vars unset or set to false
# NEXT_PUBLIC_ENABLE_EAS=false

# Use placeholder schema UID (not 64-char hex)
NEXT_PUBLIC_DAILY_CHECKIN_SCHEMA_UID=0xp2e_daily_checkin_001
```

## Database Schema Reference

### user_activities table

```sql
CREATE TABLE public.user_activities (
  id UUID PRIMARY KEY,
  user_profile_id UUID REFERENCES user_profiles(id),
  activity_type VARCHAR(50),      -- 'daily_checkin'
  activity_data JSONB,             -- { greeting, streak, attestationUid, etc. }
  points_earned INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
);
```

### attestations table

```sql
CREATE TABLE public.attestations (
  id UUID PRIMARY KEY,
  attestation_uid TEXT UNIQUE,
  schema_uid TEXT,                 -- '0xp2e_daily_checkin_001'
  attester TEXT,                   -- Wallet address (42 chars)
  recipient TEXT,                  -- Wallet address (42 chars)
  data JSONB,                      -- { walletAddress, greeting, timestamp, etc. }
  is_revoked BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
);
```

## Migration History

- **095_relax_attestation_address_validation.sql**
  - Relaxed address validation constraints
  - Uses regex pattern matching instead of strict length check
- **096_add_user_activities_streak_calculation.sql**
  - Added `get_user_checkin_streak_from_activities()` function
  - Updated `get_user_checkin_streak()` to check both sources
  - Updated `has_checked_in_today()` to check both sources
  - Added helper function `get_user_profile_id_from_address()`
  - Added performance index on user_activities

## Rollback Procedure

If issues arise, the database functions will gracefully fallback:

1. Functions check attestations first (backward compatible)
2. Only query user_activities if attestations are empty
3. Old behavior maintained for users with existing attestations

**No data loss risk** - both tables maintain their records independently.

## Future Improvements

1. **Environment-aware API response:** Return attestation status in API response for debugging
2. **Admin dashboard:** Show EAS mode status and attestation health
3. **Batch attestation creation:** For users who checked in before EAS was enabled
4. **Migration tool:** Move existing user_activities check-ins to attestations when enabling EAS

## Related Files

- `lib/checkin/streak/calculator.ts` - Client-side streak calculation
- `lib/checkin/core/service.ts` - Check-in service with attestation creation
- `pages/api/checkin/index.ts` - Check-in API endpoint
- `lib/attestation/core/service.ts` - Attestation service with EAS toggle
- `lib/attestation/core/config.ts` - EAS configuration and schema UIDs
- `hooks/checkin/useDailyCheckin.ts` - React hook for check-ins
- `hooks/checkin/useStreakData.ts` - React hook for streak data
- `components/lobby/checkin-strip.tsx` - UI component for check-ins

## Support

If streaks still show 0 after this fix:

1. Check environment variables (see above)
2. Check database has records:

   ```sql
   -- Check user_activities
   SELECT * FROM user_activities
   WHERE activity_type = 'daily_checkin'
   ORDER BY created_at DESC LIMIT 10;

   -- Check attestations
   SELECT * FROM attestations
   WHERE schema_uid = '0xp2e_daily_checkin_001'
   ORDER BY created_at DESC LIMIT 10;
   ```

3. Check API logs for "STREAK TRACKING BROKEN" errors
4. Verify user's wallet address matches between tables
