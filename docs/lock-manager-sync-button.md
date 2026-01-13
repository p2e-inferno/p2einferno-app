# Lock Manager Status Sync Button

## Overview

The Lock Manager Status Sync Button is a UX feature that allows admins to synchronize database state with blockchain state when there's a mismatch in lock manager permissions.

## Problem It Solves

### The Mismatch Scenario

When deploying entities (bootcamps, cohorts, quests, milestones), the system attempts to grant lock manager permissions to the server wallet. Sometimes this can fail or the state can get out of sync:

- **Scenario 1**: Lock deployed successfully, but database update failed
  - Database: `lock_manager_granted = false`
  - Blockchain: Server wallet IS a lock manager

- **Scenario 2**: Database recovery after reset
  - Database: `lock_manager_granted = false` (default after recovery)
  - Blockchain: Server wallet IS a lock manager (from original deployment)

Without a sync button, admins see the mismatch warning but have no UI-based way to resolve it.

## Solution: The Sync Button

### Component

`components/admin/SyncLockStateButton.tsx`

This component has two modes:
- `mode="maxKeys"` - Syncs purchase security state (maxNumberOfKeys)
- `mode="manager"` - Syncs lock manager state (lock_manager_granted)

### Where It's Used

The sync button appears in the "Lock Manager Status" section on these admin pages when there's a mismatch:

1. **Bootcamps** (`pages/admin/bootcamps/[id].tsx`)
2. **Cohorts** (`pages/admin/cohorts/[cohortId]/index.tsx`)
3. **Quests** (`pages/admin/quests/[id].tsx`)
4. **Milestones** (`pages/admin/cohorts/[cohortId]/milestones/[milestoneId].tsx`)

## UX Flow

### Step 1: User Sees Mismatch

```
┌─────────────────────────────────────────┐
│ Lock Manager Status                     │
├─────────────────────────────────────────┤
│ Database Status:     ❌ Not Granted     │
│ Blockchain Status:   ✅ Is Manager      │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ⚠️ Status Mismatch: Database and    │ │
│ │ blockchain states don't match!      │ │
│ │                                     │ │
│ │ [Sync state] ← Sync button appears │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Step 2: User Clicks "Sync state"

- Button shows "Syncing..." with spinner
- System reads server wallet address from backend
- System checks `isLockManager(serverWallet, lockAddress)` on-chain
- System updates database with the blockchain truth:
  - `lock_manager_granted = true` (if IS manager)
  - `lock_manager_granted = false` (if NOT manager)
  - `grant_failure_reason = null` (if IS manager) or error message

### Step 3: After Sync Completes

```
┌─────────────────────────────────────────┐
│ Lock Manager Status                     │
├─────────────────────────────────────────┤
│ Database Status:     ✅ Granted         │
│ Blockchain Status:   ✅ Is Manager      │
│                                         │
│ (No mismatch warning - states match!)  │
└─────────────────────────────────────────┘
```

## Technical Implementation

### Hook: `useSyncLockManagerState`

**Location**: `hooks/unlock/useSyncLockManagerState.ts`

**Entity Types Supported**:
```typescript
export type LockManagerEntityType = "milestone" | "quest" | "bootcamp" | "cohort";
```

**Flow**:
1. Fetches server wallet address via `/api/admin/server-wallet`
2. Checks on-chain status via `checkIsLockManager(serverWallet, lockAddress)`
3. Updates database via entity-specific API endpoints:
   - Milestones: `PUT /api/admin/milestones`
   - Quests: `PATCH /api/admin/quests/:id`
   - Bootcamps: `PUT /api/admin/bootcamps/:id`
   - Cohorts: `PUT /api/admin/cohorts/:id`

### Conditional Rendering

The sync button only appears when:
```typescript
actualManagerStatus !== null &&
entity.lock_manager_granted !== actualManagerStatus
```

This ensures:
- Blockchain state has been checked (`actualManagerStatus !== null`)
- There's an actual mismatch between DB and blockchain

## Recovery Scenarios

### Draft Recovery After DB Reset

**Problem**:
- User deploys milestone, lock successfully created on-chain
- Database gets reset (loses all data)
- User recovers milestone from draft localStorage
- New database record created with default `lock_manager_granted = false`
- Blockchain still has server wallet as lock manager

**Solution**:
1. User opens milestone page
2. System checks blockchain: `✅ Is Manager`
3. Mismatch warning appears with sync button
4. User clicks sync
5. Database updated to `lock_manager_granted = true`
6. System fully consistent

### Failed Grant During Deployment

**Problem**:
- Lock deployment succeeds
- Adding server wallet as lock manager fails (network issue, gas problem, etc.)
- Database marked as `lock_manager_granted = false` with error reason

**Solutions**:
1. **If truly failed on-chain**:
   - User sees "Not Manager" on blockchain
   - Can use `LockManagerRetryButton` to retry granting permissions

2. **If grant actually succeeded but DB update failed**:
   - User sees "Is Manager" on blockchain
   - Uses sync button to update database to match

## Related Components

### LockManagerRetryButton

**Location**: `components/admin/LockManagerRetryButton.tsx`

**Purpose**: Retry granting lock manager permissions (executes blockchain transaction)

**When to use**: When blockchain shows "Not Manager" and you want to FIX it

### SyncLockStateButton (mode="manager")

**Purpose**: Sync database to match blockchain (read-only, no transaction)

**When to use**: When blockchain shows "Is Manager" but database says "Not Granted"

## Key Differences: Sync vs Retry

| Feature | SyncLockStateButton (mode="manager") | LockManagerRetryButton |
|---------|-------------------------------------|------------------------|
| **Action** | Read blockchain → Update DB | Execute transaction → Update DB |
| **Blockchain TX** | No (read-only) | Yes (writes to chain) |
| **Use Case** | DB out of sync with chain | Server wallet not yet a manager |
| **Cost** | Free (no gas) | Requires gas fees |
| **When shown** | Mismatch: DB says false, Chain says true | Chain says false |

## Error Handling

If sync fails:
- Toast error shown with message
- `onError` callback invoked (if provided)
- Database remains unchanged
- User can retry

Common errors:
- Failed to fetch server wallet address
- Failed to verify lock manager status on-chain
- API error updating database

## Future Enhancements

Potential improvements:
1. Auto-sync on page load if mismatch detected
2. Batch sync for multiple entities
3. Sync history/audit log
4. Alert admins when mismatches are detected

## Related Documentation

- [Lock Manager Admin Context](./admin-lock-manager-context.md)
- [Grant-Based Lock Security](./grant-based-lock-security.md)
- [Draft Recovery System](./draft-recovery.md)
