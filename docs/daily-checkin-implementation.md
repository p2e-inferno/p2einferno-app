# Daily Check-in Implementation Guide

This document provides comprehensive guidance for the daily check-in feature implementation in P2E Inferno, including exact file paths, API references, and integration patterns to prevent duplication and ensure consistent development.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Library (`lib/checkin`)](#core-library-libcheckin)
4. [React Hooks (`hooks/checkin`)](#react-hooks-hookscheckin)
5. [UI Components (`components/checkin`)](#ui-components-componentscheckin)
6. [Database Schema](#database-schema)
7. [Testing Strategy](#testing-strategy)
8. [Integration Patterns](#integration-patterns)
9. [Extension Points](#extension-points)
10. [Common Patterns](#common-patterns)

## Overview

The daily check-in feature encourages user engagement by rewarding consistent daily activity with XP and streak multipliers. It's built as a modular system using the Strategy pattern, allowing independent modification and extension of components.

### Key Features
- **Daily Check-ins**: Users can check in once per day with a customizable greeting
- **Streak Tracking**: Consecutive check-ins build up streak counts
- **Multiplier System**: Streak-based XP multipliers reward consistency
- **Attestation Integration**: Check-ins are recorded as on-chain attestations via EAS
- **XP Rewards**: Users earn experience points with bonus calculations
- **Activity Logging**: All check-ins are recorded in user activity history

### Dependencies
- **Ethereum Attestation Service (EAS)**: For on-chain proof storage
- **Supabase**: Database operations and RPC functions
- **Privy**: Wallet authentication and management
- **React**: Hook-based state management

## Architecture

The system follows a layered, modular architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Components                            │
│                 (components/checkin/)                       │
├─────────────────────────────────────────────────────────────┤
│                    React Hooks                              │
│                  (hooks/checkin/)                          │
├─────────────────────────────────────────────────────────────┤
│                    Core Services                            │
│                  (lib/checkin/)                            │
├─────────────────────────────────────────────────────────────┤
│                 External Services                           │
│            (EAS, Supabase, Privy)                          │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles
- **Modularity**: Each component can be independently modified
- **Strategy Pattern**: Swappable algorithms for streak, multiplier, XP calculations
- **Dependency Injection**: Services accept strategy implementations
- **Separation of Concerns**: Clear boundaries between layers
- **Testability**: Comprehensive mocking and testing support

## Core Library (`lib/checkin`)

### Entry Point
**File**: `lib/checkin/index.ts`
**Purpose**: Public API for the entire daily check-in module

```typescript
// Import all daily check-in functionality
import { 
  DailyCheckinService, 
  createDailyCheckinService,
  CheckinData,
  StreakInfo,
  CheckinResult 
} from '@/lib/checkin';
```

### Types and Interfaces (`lib/checkin/core/types.ts`)

Core type definitions for the daily check-in system:

```typescript
interface CheckinData {
  walletAddress: string;
  greeting: string;
  timestamp: number;
  userDid: string;
  xpGained: number;
}

interface StreakInfo {
  currentStreak: number;
  lastCheckinDate: Date | null;
  longestStreak: number;
  isActive: boolean;
}

interface CheckinResult {
  success: boolean;
  xpEarned: number;
  newStreak: number;
  attestationUid?: string;
  breakdown?: XPBreakdown;
  error?: string;
}

interface CheckinPreview {
  currentStreak: number;
  nextStreak: number;
  currentMultiplier: number;
  nextMultiplier: number;
  previewXP: number;
  breakdown: XPBreakdown;
}
```

**Strategy Interfaces** (for extensibility):
- `StreakCalculatorStrategy`
- `MultiplierStrategy` 
- `XPCalculatorStrategy`
- `XPUpdaterStrategy`

### Core Service (`lib/checkin/core/service.ts`)

**Class**: `DailyCheckinService`
**Purpose**: Main orchestrator for check-in operations

```typescript
class DailyCheckinService {
  constructor(
    attestationService: AttestationService,
    streakCalculator: StreakCalculatorStrategy,
    multiplierStrategy: MultiplierStrategy,
    xpCalculator: XPCalculatorStrategy,
    xpUpdater: XPUpdaterStrategy
  )

  // Core Methods
  async canCheckinToday(userAddress: string): Promise<boolean>
  async getCheckinStatus(userAddress: string): Promise<CheckinStatus>
  async getCheckinPreview(userAddress: string): Promise<CheckinPreview>
  async performCheckin(userAddress: string, userProfileId: string, greeting: string, wallet: any): Promise<CheckinResult>
  async getStreakInfo(userAddress: string): Promise<StreakInfo>
  async getCurrentXPBreakdown(userAddress: string): Promise<XPBreakdown>
  async validateCheckin(userAddress: string, userProfileId: string, wallet: any): Promise<{ isValid: boolean; reason?: string }>

  // Multiplier helpers
  getMultiplierTiers(): MultiplierTier[]
  getCurrentMultiplier(streak: number): number
  getCurrentTier(streak: number): MultiplierTier | null
  getNextTier(streak: number): MultiplierTier | null
  getProgressToNextTier(streak: number): number
}
```

### Service Factory (`lib/checkin/core/schemas.ts`)

**Functions**: Factory functions for dependency injection

```typescript
// Create service with default strategies
const service = createDailyCheckinService();

// Create service with custom strategies (partial overrides allowed)
const customService = createDailyCheckinService({
  attestationService,
  streakCalculator: customStreakCalculator,
  multiplierStrategy: customMultiplierStrategy,
  xpCalculator: customXPCalculator,
  xpUpdater: customXPUpdater,
});

// Create service for testing with mocked dependencies
const testService = createTestCheckinService({
  streakCalculator: mockStreakCalculator,
  multiplierStrategy: mockMultiplierStrategy,
  xpCalculator: mockXPCalculator,
  xpUpdater: mockXPUpdater,
});
```

### Strategy Implementations

#### Streak Calculator (`lib/checkin/streak/calculator.ts`)
```typescript
class DefaultStreakCalculator implements StreakCalculatorStrategy {
  async calculateStreak(userAddress: string): Promise<number>
  isStreakBroken(lastCheckin: Date, today: Date): boolean
  async getStreakInfo(userAddress: string): Promise<StreakInfo>
}

// Factory function
const calculator = createStreakCalculator();
```

#### Multiplier Strategies (`lib/checkin/streak/multiplier.ts`)
```typescript
// Tiered multiplier system (default)
class TieredMultiplierStrategy implements MultiplierStrategy {
  // Tiers: Beginner (1.0x), Consistent (1.5x), Dedicated (2.0x), Master (2.5x)
  calculateMultiplier(streak: number): number
  getMultiplierTiers(): MultiplierTier[]
}

// Linear multiplier system  
class LinearMultiplierStrategy implements MultiplierStrategy {
  // Incremental multiplier growth per week
  constructor(baseMultiplier = 1.0, incrementPerWeek = 0.1, maxMultiplier = 3.0)
}

// Factory functions
const tieredMultiplier = createTieredMultiplier();
const linearMultiplier = createLinearMultiplier(1.0, 0.2, 2.5);
```

#### XP Calculators (`lib/checkin/xp/calculator.ts`)
```typescript
class StandardXPCalculator implements XPCalculatorStrategy {
  calculateBaseXP(): number
  calculateStreakBonus(streak: number): number  
  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number
  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown
}

class EventXPCalculator implements XPCalculatorStrategy {
  // Decorator pattern for temporary event bonuses
  constructor(baseCalculator: XPCalculatorStrategy, eventMultiplier: number, eventEndDate?: Date)
}

// Factory functions
const standardCalc = createStandardXPCalculator({ baseXP: 15, weeklyBonus: 10 });
const eventCalc = createEventXPCalculator(standardCalc, 2.0, new Date('2024-12-31'));
```

#### XP Updaters (`lib/checkin/xp/updater.ts`)
```typescript
class SupabaseXPUpdater implements XPUpdaterStrategy {
  async updateUserXP(userProfileId: string, xpAmount: number, metadata: any): Promise<void>
  async recordActivity(userProfileId: string, activityData: any): Promise<void>
  async updateUserXPWithActivity(userProfileId: string, xpAmount: number, activityData: any): Promise<void>
}

class MockXPUpdater implements XPUpdaterStrategy {
  // For testing - records operations without database calls
  getUpdates(): Array<UpdateRecord>
  getActivities(): Array<ActivityRecord>
  clear(): void
}

// Factory functions
const updater = createSupabaseXPUpdater();
const mockUpdater = createMockXPUpdater();
```

## React Hooks (`hooks/checkin`)

### Entry Point
**File**: `hooks/checkin/index.ts`
```typescript
export { useDailyCheckin } from './useDailyCheckin';
export { useStreakData } from './useStreakData';
```

### Main Check-in Hook (`hooks/checkin/useDailyCheckin.ts`)

**Hook**: `useDailyCheckin(userAddress, userProfileId, options?)`

```typescript
interface UseDailyCheckinReturn {
  checkinStatus: CheckinStatus | null;
  streakInfo: StreakInfo | null;
  checkinPreview: CheckinPreview | null;
  performCheckin: (greeting?: string) => Promise<CheckinResult>;
  refreshStatus: () => Promise<void>;
  isLoading: boolean;
  isPerformingCheckin: boolean;
  error: string | null;
  canCheckinToday: boolean;
  hasCheckedInToday: boolean;
  nextCheckinTime: Date | null;
  timeUntilNextCheckin: number | null;
  previewXP: number;
  onCheckinSuccess?: (result: CheckinResult) => void;
  onCheckinError?: (error: string) => void;
}

// Usage
const {
  checkinStatus,
  checkinPreview,
  performCheckin,
  refreshStatus,
  isLoading,
  isPerformingCheckin,
  error,
  canCheckinToday,
  hasCheckedInToday,
  previewXP,
} = useDailyCheckin(userAddress, userProfileId, {
  autoRefreshStatus: true,
  statusRefreshInterval: 30_000,
  showToasts: false,
  onCheckinSuccess: (result) => console.log('Check-in successful!', result),
  onCheckinError: (reason) => console.error('Check-in failed:', reason),
});
```

**Features**:
- ✅ Automatic status fetching with optional polling (`autoRefreshStatus`)
- ✅ Separate loading flags for status and mutations (`isLoading`, `isPerformingCheckin`)
- ✅ Built-in Privy wallet validation before performing a check-in
- ✅ XP preview data (`checkinPreview`, `previewXP`)
- ✅ Convenience flags for UI state (`canCheckinToday`, `hasCheckedInToday`)
- ✅ Hooks for success/error callbacks and manual refresh via `refreshStatus`

### Streak Data Hook (`hooks/checkin/useStreakData.ts`)

**Hook**: `useStreakData(userAddress, options?)`

```typescript
interface UseStreakDataReturn {
  streakInfo: StreakInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getCurrentTier: () => MultiplierTier | null;
  getNextTier: () => MultiplierTier | null;
  getProgressToNextTier: () => number;
  getCurrentMultiplier: () => number;
  getStreakStatus?: () => StreakStatus;
  getTimeUntilExpiration?: () => number | null;
  currentTier: MultiplierTier | null;
  nextTier: MultiplierTier | null;
  progress: number;
  multiplier: number;
  status: StreakStatus;
  timeUntilExpiration: number | null;
}

// Usage
const {
  streakInfo,
  currentTier,
  nextTier,
  progress,
  multiplier,
  status,
  getCurrentTier,
  getNextTier,
  getProgressToNextTier,
  getCurrentMultiplier,
} = useStreakData(userAddress, {
  autoRefresh: true,
  refreshInterval: 60_000,
  onStreakUpdate: (info) => console.log('Streak updated:', info),
  onError: (error) => console.error('Streak fetch failed:', error),
});
```

**Features**:
- ✅ Real-time streak information with optional auto-refresh
- ✅ Multiplier tier helpers (current/next tiers, progress, multiplier value)
- ✅ Derived status (`active`, `at_risk`, `broken`, `new`) and time-to-expiration
- ✅ Manual and automatic refresh controls
- ✅ Error surface with optional callback hooks

## UI Components (`components/checkin`)

### Entry Point
**File**: `components/checkin/index.ts`
```typescript
export { DailyCheckinButton } from './DailyCheckinButton';
export { StreakDisplay } from './StreakDisplay';
export { CheckinCard } from './CheckinCard';
```

### Daily Check-in Button (`components/checkin/DailyCheckinButton.tsx`)

```typescript
interface DailyCheckinButtonProps {
  userAddress: string;
  userProfileId: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  greeting?: string;
  onSuccess?: (result: CheckinResult) => void;
  onError?: (error: string) => void;
  className?: string;
}

if (!user?.wallet?.address || !userProfile?.id) {
  return <ConnectWalletPrompt />;
}

<DailyCheckinButton
  userAddress={user.wallet.address}
  userProfileId={userProfile.id}
  onSuccess={(result) => {
    toast.success(`+${result.xpEarned} XP earned! ${result.newStreak} day streak!`);
    refetchUserData();
  }}
  onError={(reason) => toast.error(reason)}
  className="w-full"
/>
```

**Features**:
- ✅ Integrated with `useDailyCheckin` hook
- ✅ Automatic button state management
- ✅ Loading and disabled states  
- ✅ Toast notifications
- ✅ Wallet connection validation

### Streak Display (`components/checkin/StreakDisplay.tsx`)

```typescript
const {
  streakInfo,
  currentTier,
  nextTier,
  progress,
  multiplier,
  status,
  timeUntilExpiration,
} = useStreakData(userAddress);

<StreakDisplay
  streak={streakInfo?.currentStreak ?? 0}
  multiplier={multiplier}
  currentTier={currentTier}
  nextTier={nextTier}
  showProgress
  status={status}
  timeUntilExpiration={timeUntilExpiration}
  className="mb-4"
/>
```

**Features**:
- ✅ Current streak summary with emoji/message helpers
- ✅ Multiplier value and tier metadata
- ✅ Progress indicator toward the next tier
- ✅ Optional streak-expiration warning state
- ✅ Skeleton and badge variants for loading/error scenarios

### Complete Check-in Card (`components/checkin/CheckinCard.tsx`)

```typescript
interface CheckinCardProps {
  userAddress: string;
  userProfileId: string;
  showStreak?: boolean;
  showPreview?: boolean;
  className?: string;
}

// Usage
<CheckinCard
  userAddress={user?.wallet?.address ?? ''}
  userProfileId={userProfile?.id ?? ''}
  className="max-w-md mx-auto"
/>
```

**Features**:
- ✅ Combines `StreakDisplay` and `DailyCheckinButton`
- ✅ Card layout with header and description
- ✅ Accepts hooks/callbacks for downstream refresh logic
- ✅ Ready-to-use component for dashboards once provided an address and profile id

## Database Schema

### RPC Functions
**File**: `supabase/migrations/062_attestation_system.sql`

```sql
-- Check if user has checked in today
CREATE OR REPLACE FUNCTION has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM attestations 
    WHERE recipient = user_address 
    AND schema_uid = '0xp2e_daily_checkin_001'
    AND DATE(created_at) = CURRENT_DATE
    AND is_revoked = false
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.attestations 
      WHERE recipient = user_address 
        AND schema_uid = '0xp2e_daily_checkin_001'
        AND is_revoked = false
        AND DATE(created_at) = current_date_check
    ) INTO checkin_exists;

    EXIT WHEN NOT checkin_exists;

    streak_count := streak_count + 1;
    current_date_check := current_date_check - INTERVAL '1 day';

    IF streak_count > 365 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;
```

### Related Tables
- `attestations`: Stores check-in attestations
- `user_profiles`: Updated with XP gains
- `user_activities`: Records check-in activities
- `attestation_schemas`: Schema definitions

## Testing Strategy

### Unit Tests (`__tests__/unit/lib/checkin/`)

**Directory Structure**:
```
__tests__/unit/lib/checkin/
├── types.test.ts                    # Interface validation
├── core/
│   ├── service.test.ts             # Main service orchestration
│   └── schemas.test.ts             # Factory functions
├── streak/
│   ├── calculator.test.ts          # Streak calculation
│   └── multiplier.test.ts          # Multiplier strategies
└── xp/
    ├── calculator.test.ts          # XP calculation  
    └── updater.test.ts             # Database operations
```

**Running Tests**:
```bash
# All unit tests
npm test __tests__/unit/lib/checkin/

# Specific test file
npm test __tests__/unit/lib/checkin/core/service.test.ts
```

### Hook Integration Tests (`__tests__/unit/hooks/checkin/`)

**Directory Structure**:
```
__tests__/unit/hooks/checkin/
├── useStreakData.test.ts           # Streak data hook
└── useDailyCheckin.test.ts         # Main check-in hook
```

**Test Patterns**:
- ✅ `renderHook` from `@testing-library/react`
- ✅ Service mocking with `jest.mock`
- ✅ Async state management testing
- ✅ Error scenario coverage
- ✅ Loading state validation

### Mocking Patterns

**Service Mocking**:
```typescript
// Mock the default service instance
jest.mock('@/lib/checkin');

const mockService = {
  getCheckinStatus: jest.fn(),
  getCheckinPreview: jest.fn(),
  validateCheckin: jest.fn(),
  performCheckin: jest.fn(),
} as jest.Mocked<DailyCheckinService>;

(getDefaultCheckinService as jest.Mock).mockReturnValue(mockService);
```

**Supabase Mocking**:
```typescript
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));
```

## Integration Patterns

### Dashboard Integration

**Example**: Adding check-in to user dashboard
```typescript
// pages/dashboard.tsx
import { CheckinCard } from '@/components/checkin';
import { usePrivy } from '@privy-io/react-auth';

export default function Dashboard() {
  const { user } = usePrivy();

  if (!user?.wallet?.address || !user?.id) {
    return <ConnectWalletPrompt />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <CheckinCard
        userAddress={user.wallet.address}
        userProfileId={user.id}
      />
      {/* Other dashboard components */}
    </div>
  );
}
```

### Custom Integration

**Example**: Custom check-in flow with specific requirements
```typescript
import { useDailyCheckin, useStreakData } from '@/hooks/checkin';

function CustomCheckinFlow() {
  const { user } = usePrivy();
  const userAddress = user?.wallet?.address;
  const userProfileId = user?.id;

  if (!userAddress || !userProfileId) {
    return <ConnectWalletPrompt />;
  }
  
  const { performCheckin, canCheckinToday, isPerformingCheckin } = useDailyCheckin(userAddress, userProfileId, {
    onCheckinSuccess: (result) => {
      analytics.track('daily_checkin_completed', {
        xp_earned: result.xpEarned,
        streak: result.newStreak,
      });
    },
    onCheckinError: (error) => reportError(error),
  });
  
  const { streakInfo, currentTier } = useStreakData(userAddress);
  
  const handleCustomCheckin = async () => {
    const customGreeting = `Good ${getTimeOfDay()}!`;
    const result = await performCheckin(customGreeting);
    
    if (result.success) {
      showConfetti();
      updateLeaderboard();
    }
  };
  
  return (
    <div>
      <DailyCheckinButton
        userAddress={userAddress}
        userProfileId={userProfileId}
        disabled={!canCheckinToday || isPerformingCheckin}
        onSuccess={() => handleCustomCheckin()}
      />
      {streakInfo && currentTier && (
        <p>
          Current tier: {currentTier.name} — streak {streakInfo.currentStreak} days
        </p>
      )}
    </div>
  );
}
```

### Quest Integration

**Example**: Integrating check-ins with quest system
```typescript
import { createDailyCheckinService } from '@/lib/checkin';

const questCheckinService = createDailyCheckinService();

export async function performQuestCheckin(
  userAddress: string,
  userProfileId: string,
  greeting: string,
  wallet: any,
) {
  const result = await questCheckinService.performCheckin(
    userAddress,
    userProfileId,
    greeting,
    wallet,
  );

  if (result.success) {
    await updateQuestProgress(userProfileId, 'daily_checkin', 1);
  }

  return result;
}
```

## Extension Points

### Adding Custom Multiplier Strategy

**File**: `lib/checkin/streak/custom-multiplier.ts`
```typescript
import { MultiplierStrategy, MultiplierTier } from '@/lib/checkin/core/types';

export class SeasonalMultiplierStrategy implements MultiplierStrategy {
  calculateMultiplier(streak: number): number {
    const season = getCurrentSeason();
    const baseMultiplier = this.getBaseMultiplier(streak);
    
    switch (season) {
      case 'winter':
        return baseMultiplier * 1.2; // Winter bonus
      case 'summer':
        return baseMultiplier * 0.9; // Summer reduction
      default:
        return baseMultiplier;
    }
  }
  
  // Implement other required methods...
}

// Usage
const seasonalService = createDailyCheckinService(
  undefined, // Default attestation service
  undefined, // Default streak calculator
  new SeasonalMultiplierStrategy(), // Custom multiplier
  undefined, // Default XP calculator
  undefined  // Default XP updater
);
```

### Adding Custom XP Calculator

**File**: `lib/checkin/xp/premium-calculator.ts`
```typescript
import { XPCalculatorStrategy, XPBreakdown } from '@/lib/checkin/core/types';

export class PremiumXPCalculator implements XPCalculatorStrategy {
  constructor(private isPremiumUser: boolean) {}
  
  calculateBaseXP(): number {
    return this.isPremiumUser ? 20 : 10; // Double base XP for premium
  }
  
  calculateStreakBonus(streak: number): number {
    const baseBonus = streak * 2;
    return this.isPremiumUser ? baseBonus * 1.5 : baseBonus;
  }
  
  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number {
    const total = (baseXP + bonus) * multiplier;
    return this.isPremiumUser ? Math.floor(total * 1.25) : Math.floor(total);
  }
  
  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown {
    const baseXP = this.calculateBaseXP();
    const streakBonus = this.calculateStreakBonus(streak);
    const totalXP = this.calculateTotalXP(baseXP, streakBonus, multiplier);
    
    return { baseXP, streakBonus, multiplier, totalXP };
  }
}
```

### Adding Custom Activity Tracking

**Example file**: `lib/checkin/xp/analytics-updater.ts`
```typescript
import { SupabaseXPUpdater } from '@/lib/checkin/xp/updater';

export class AnalyticsXPUpdater extends SupabaseXPUpdater {
  async updateUserXPWithActivity(
    userProfileId: string,
    xpAmount: number,
    activityData: any
  ): Promise<void> {
    // Call parent implementation
    await super.updateUserXPWithActivity(userProfileId, xpAmount, activityData);
    
    // Add analytics tracking
    analytics.track('xp_gained', {
      user_id: userProfileId,
      xp_amount: xpAmount,
      source: 'daily_checkin',
      streak: activityData.streak,
      multiplier: activityData.xpBreakdown?.multiplier
    });
    
    // Update leaderboard
    await updateLeaderboard(userProfileId, xpAmount);
  }
}
```

## Common Patterns

### Error Handling

```typescript
// Service level
try {
  const result = await service.performCheckin(userAddress, userProfileId, greeting, wallet);
  if (!result.success) {
    console.error('Check-in failed:', result.error);
    return;
  }
  // Handle success
} catch (error) {
  console.error('Unexpected error:', error);
}

// Hook level with error callbacks
const { performCheckin } = useDailyCheckin(userAddress, userProfileId, {
  onError: (error) => toast.error(`Check-in failed: ${error}`)
});

// Component level with try-catch
const handleCheckin = async () => {
  try {
    const result = await performCheckin();
    if (result.success) {
      toast.success('Check-in successful!');
    }
  } catch (error) {
    toast.error('Something went wrong');
  }
};
```

### Loading States

```typescript
// Hook provides loading states
const { isLoading, isPerformingCheckin, canCheckinToday } = useDailyCheckin(userAddress, userProfileId);

// Component usage
<Button 
  disabled={!canCheckinToday || isPerformingCheckin || isLoading}
>
  {isPerformingCheckin ? 'Checking in…' : 'Check in for +25 XP'}
</Button>
```

### Data Refresh

```typescript
// Manual refresh
const { refetch } = useStreakData(userAddress);
const { refreshStatus } = useDailyCheckin(userAddress, userProfileId);

// Refresh after other actions
const handleProfileUpdate = async () => {
  await updateUserProfile();
  await refetch(); // Refresh streak data
  await refreshStatus(); // Refresh check-in status
};

// Automatic refresh on success
const { performCheckin } = useDailyCheckin(userAddress, userProfileId, {
  onSuccess: () => {
    refetchUserData();
    refetchLeaderboard();
  }
});
```

### Conditional Rendering

```typescript
// Show different states based on check-in status
function CheckinStatus() {
  const { canCheckinToday, checkinPreview, isLoading } = useDailyCheckin(userAddress, userProfileId);
  const { status } = useStreakData(userAddress);
  
  if (isLoading) return <CheckinSkeleton />;
  
  return (
    <div>
      {canCheckinToday ? (
        <div>
          <p>Ready to check in! Earn {checkinPreview?.previewXP} XP</p>
          <DailyCheckinButton userAddress={userAddress} userProfileId={userProfileId} />
        </div>
      ) : (
        <div>
          <p>✅ Already checked in today!</p>
          {status === 'active' && <p>🔥 Streak is safe for today</p>}
          {status === 'at_risk' && <p>⚠️ Don't forget to check in tomorrow!</p>}
        </div>
      )}
    </div>
  );
}
```

### Testing Custom Implementations

```typescript
// Test custom strategy
describe('CustomMultiplierStrategy', () => {
  let strategy: CustomMultiplierStrategy;
  
  beforeEach(() => {
    strategy = new CustomMultiplierStrategy();
  });
  
  test('calculates multiplier correctly', () => {
    expect(strategy.calculateMultiplier(5)).toBe(1.5);
    expect(strategy.calculateMultiplier(10)).toBe(2.0);
  });
});

// Test service with custom strategy
describe('DailyCheckinService with custom strategy', () => {
  test('uses custom multiplier strategy', async () => {
    const customStrategy = new CustomMultiplierStrategy();
    const service = createTestCheckinService({
      multiplierStrategy: customStrategy
    });
    
    const result = await service.getCheckinPreview(userAddress);
    expect(result.nextMultiplier).toBe(customStrategy.calculateMultiplier(result.nextStreak));
  });
});
```

---

## Quick Reference

### File Paths Summary
```
# Core Library
lib/checkin/index.ts                         # Public API
lib/checkin/core/types.ts                    # Type definitions
lib/checkin/core/service.ts                  # Main service
lib/checkin/core/schemas.ts                  # Factory functions
lib/checkin/streak/calculator.ts             # Streak calculation
lib/checkin/streak/multiplier.ts             # Multiplier strategies
lib/checkin/xp/calculator.ts                 # XP calculation
lib/checkin/xp/updater.ts                    # Database operations

# React Hooks
hooks/checkin/index.ts                       # Hook exports
hooks/checkin/useDailyCheckin.ts             # Main check-in hook
hooks/checkin/useStreakData.ts               # Streak data hook

# UI Components
components/checkin/index.ts                  # Component exports
components/checkin/DailyCheckinButton.tsx    # Check-in button
components/checkin/StreakDisplay.tsx         # Streak information
components/checkin/CheckinCard.tsx           # Complete card component

# Database
supabase/migrations/062_attestation_system.sql # Schema & RPC functions

# Tests
__tests__/unit/lib/checkin/                  # Unit tests
__tests__/unit/hooks/checkin/                # Hook tests
```

### Import Patterns
```typescript
// Core functionality
import { createDailyCheckinService, CheckinResult } from '@/lib/checkin';

// React hooks
import { useDailyCheckin, useStreakData } from '@/hooks/checkin';

// UI components
import { CheckinCard, DailyCheckinButton, StreakDisplay } from '@/components/checkin';

// Custom strategies
import { TieredMultiplierStrategy, StandardXPCalculator } from '@/lib/checkin';
```

This comprehensive guide provides all the necessary information for developers to use, extend, and maintain the daily check-in feature while avoiding duplication and ensuring consistent patterns across the application.

