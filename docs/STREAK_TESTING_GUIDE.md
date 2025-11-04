# Streak Functionality Testing Guide

## Overview

This guide provides multiple strategies for testing the daily check-in streak functionality **without waiting for real time to pass**. The streak system depends on time-based logic, but we can mock time to simulate multi-day scenarios instantly.

---

## Strategy 1: Unit Tests (Recommended for Logic Testing)

### Setup Overview
- **Framework**: Jest
- **Environment**: jsdom with Node.js environment for server functions
- **Key Technique**: Mock `Date` constructor and `Date.now()` to control time

### Test File Location
Create: `__tests__/unit/lib/checkin/streak/calculator.test.ts`

### Example Test Cases

```typescript
import { DefaultStreakCalculator } from "@/lib/checkin/streak/calculator";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/supabase");

describe("DefaultStreakCalculator - Streak Logic", () => {
  let calculator: DefaultStreakCalculator;
  let realDate: typeof Date;

  beforeEach(() => {
    // Save the real Date
    realDate = Date;
    calculator = new DefaultStreakCalculator();
  });

  afterEach(() => {
    // Restore real Date
    global.Date = realDate;
    jest.clearAllMocks();
  });

  describe("getStreakStatus - Time-based transitions", () => {
    test("should return 'active' when streak exists and last checkin was recent", async () => {
      // Mock current time
      const now = new Date("2024-01-15T10:00:00Z");
      jest.spyOn(global, "Date").mockImplementation(() => now as any);
      (global.Date as any).now = () => now.getTime();
      (global.Date as any).parse = realDate.parse;
      (global.Date as any).UTC = realDate.UTC;

      // Mock getStreakInfo to return active streak
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
        currentStreak: 5,
        lastCheckinDate: new Date("2024-01-15T09:00:00Z"), // 1 hour ago
        longestStreak: 5,
        isActive: true,
      });

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("active");
    });

    test("should return 'at_risk' when streak exists but last checkin was 20 hours ago", async () => {
      const now = new Date("2024-01-15T10:00:00Z");
      jest.spyOn(global, "Date").mockImplementation(() => now as any);
      (global.Date as any).now = () => now.getTime();

      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
        currentStreak: 5,
        lastCheckinDate: new Date("2024-01-14T14:00:00Z"), // 20 hours ago
        longestStreak: 5,
        isActive: true,
      });

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("at_risk");
    });

    test("should return 'broken' when last checkin was >24 hours ago", async () => {
      const now = new Date("2024-01-15T10:00:00Z");
      jest.spyOn(global, "Date").mockImplementation(() => now as any);
      (global.Date as any).now = () => now.getTime();

      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
        currentStreak: 5,
        lastCheckinDate: new Date("2024-01-13T09:00:00Z"), // 25 hours ago
        longestStreak: 5,
        isActive: true,
      });

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("broken");
    });

    test("should return 'new' when currentStreak is 0", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
        currentStreak: 0,
        lastCheckinDate: null,
        longestStreak: 0,
        isActive: false,
      });

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("new");
    });
  });

  describe("isStreakBroken - Edge cases", () => {
    test("should detect streak break at exactly 24 hours", () => {
      const lastCheckin = new Date("2024-01-14T10:00:00Z");
      const today = new Date("2024-01-15T10:00:01Z"); // 24 hours + 1 second

      const isBroken = calculator.isStreakBroken(lastCheckin, today);

      expect(isBroken).toBe(true);
    });

    test("should not break streak before 24 hours", () => {
      const lastCheckin = new Date("2024-01-14T10:00:00Z");
      const today = new Date("2024-01-15T09:59:59Z"); // 23 hours 59 minutes 59 seconds

      const isBroken = calculator.isStreakBroken(lastCheckin, today);

      expect(isBroken).toBe(false);
    });
  });

  describe("getTimeUntilStreakExpires - Countdown logic", () => {
    test("should calculate time until expiration correctly", async () => {
      const now = new Date("2024-01-15T10:00:00Z");
      jest.spyOn(global, "Date").mockImplementation(() => now as any);
      (global.Date as any).now = () => now.getTime();

      const lastCheckinDate = new Date("2024-01-14T12:00:00Z"); // 22 hours ago

      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
        currentStreak: 5,
        lastCheckinDate,
        longestStreak: 5,
        isActive: true,
      });

      const timeRemaining = await calculator.getTimeUntilStreakExpires("0x123");

      // Should have 2 hours remaining (24 - 22)
      const expectedMs = 2 * 60 * 60 * 1000;
      expect(timeRemaining).toBeLessThanOrEqual(expectedMs);
      expect(timeRemaining).toBeGreaterThanOrEqual(expectedMs - 1000); // Allow 1 second margin
    });

    test("should return null when streak is not active", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
        currentStreak: 0,
        lastCheckinDate: null,
        longestStreak: 0,
        isActive: false,
      });

      const timeRemaining = await calculator.getTimeUntilStreakExpires("0x123");

      expect(timeRemaining).toBeNull();
    });
  });
});
```

### Running Unit Tests
```bash
npm test -- streak/calculator.test.ts
npm test -- streak/calculator.test.ts --watch  # Watch mode for development
npm test:coverage                              # See coverage
```

---

## Strategy 2: Hook Tests (React Testing Library)

### Setup Overview
- Test React hooks in isolation
- Mock time-dependent behavior
- Test component re-renders based on streak status

### Test File Location
Create: `__tests__/unit/hooks/checkin/useStreakData.test.ts`

### Example Test Case

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { useStreakData } from "@/hooks/checkin/useStreakData";
import { getDefaultCheckinService } from "@/lib/checkin";

jest.mock("@/lib/checkin");
jest.mock("@/hooks/checkin/useVisibilityAwarePoll", () => ({
  useVisibilityAwarePoll: jest.fn(),
}));

describe("useStreakData Hook", () => {
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getStreakInfo: jest.fn(),
      getCurrentTier: jest.fn(),
      getNextTier: jest.fn(),
      getProgressToNextTier: jest.fn(),
      getCurrentMultiplier: jest.fn(),
    };

    (getDefaultCheckinService as jest.Mock).mockReturnValue(mockService);
  });

  test("should display active streak when currentStreak > 0", async () => {
    mockService.getStreakInfo.mockResolvedValue({
      currentStreak: 7,
      lastCheckinDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      longestStreak: 7,
      isActive: true,
    });

    const { result } = renderHook(() =>
      useStreakData("0x123", { autoRefresh: false }),
    );

    await waitFor(() => {
      expect(result.current.streakInfo?.currentStreak).toBe(7);
      expect(result.current.status).toBe("active");
    });
  });

  test("should show streak as at_risk when close to expiration", async () => {
    mockService.getStreakInfo.mockResolvedValue({
      currentStreak: 7,
      lastCheckinDate: new Date(Date.now() - 21 * 60 * 60 * 1000), // 21 hours ago
      longestStreak: 7,
      isActive: true,
    });

    const { result } = renderHook(() =>
      useStreakData("0x123", { autoRefresh: false }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("at_risk");
    });
  });

  test("should report streak as broken when >24 hours since checkin", async () => {
    mockService.getStreakInfo.mockResolvedValue({
      currentStreak: 7,
      lastCheckinDate: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      longestStreak: 7,
      isActive: true,
    });

    const { result } = renderHook(() =>
      useStreakData("0x123", { autoRefresh: false }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("broken");
    });
  });
});
```

---

## Strategy 3: Integration Tests (End-to-End Testing Scenarios)

### Setup Overview
- Uses local Supabase instance
- Tests full flow from database to UI
- Most realistic but slightly slower

### Preparation Steps

**1. Reset Database to Clean State**
```bash
supabase db reset
```

**2. Seed Test Data**
Add to `supabase/seed.sql`:
```sql
-- Insert a test user
INSERT INTO public.user_profiles (wallet_address, display_name)
VALUES (
  '0xtest_streak_user_123',
  'Test Streak User'
) RETURNING id;

-- Insert checkin history (will be populated during tests)
```

### Test File Location
Create: `__tests__/integration/streak-flow.test.ts`

### Example Test Case

```typescript
import { DefaultStreakCalculator } from "@/lib/checkin/streak/calculator";
import { supabase } from "@/lib/supabase";
import { Database } from "@/lib/supabase/types-gen";

describe("Streak Flow - Integration Test", () => {
  const testUserAddress = "0xtest_streak_user_123";

  beforeAll(async () => {
    // Reset database before integration tests
    // In local dev: supabase db reset
  });

  test("new user has zero streak on first login", async () => {
    const calculator = new DefaultStreakCalculator();
    const streakInfo = await calculator.getStreakInfo(testUserAddress);

    expect(streakInfo.currentStreak).toBe(0);
    expect(streakInfo.isActive).toBe(false);
  });

  test("user gets active streak after first checkin", async () => {
    // Simulate first checkin by inserting activity
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("wallet_address", testUserAddress.toLowerCase())
      .single();

    if (profile) {
      await supabase.from("user_activities").insert({
        user_profile_id: profile.id,
        activity_type: "daily_checkin",
        created_at: new Date().toISOString(),
      });
    }

    const calculator = new DefaultStreakCalculator();
    const streakInfo = await calculator.getStreakInfo(testUserAddress);

    expect(streakInfo.currentStreak).toBe(1);
    expect(streakInfo.isActive).toBe(true);
  });

  test("streak persists after page refresh on same day", async () => {
    // Simulate page refresh by making independent calls
    const calculator = new DefaultStreakCalculator();
    const streakInfo1 = await calculator.getStreakInfo(testUserAddress);
    const streakInfo2 = await calculator.getStreakInfo(testUserAddress);

    expect(streakInfo1.currentStreak).toBe(streakInfo2.currentStreak);
    expect(streakInfo1.isActive).toBe(streakInfo2.isActive);
  });
});
```

---

## Strategy 4: Manual Testing with Time Manipulation

### For Quick Manual Testing in Browser DevTools

**1. Override System Time (for development only)**

Add to your component during testing:
```typescript
// ⚠️ ONLY for development/testing
if (process.env.NEXT_PUBLIC_DEBUG_TIME === "true") {
  // Override Date.now() globally
  const mockTime = new Date("2024-01-20T10:00:00Z").getTime();
  (global.Date as any).now = () => mockTime;
}
```

Then in `.env.local`:
```
NEXT_PUBLIC_DEBUG_TIME=true
```

**2. Database Manipulation (Direct)**

Connect to local Supabase and manipulate test data:
```bash
supabase studio
```

In the Studio UI:
- Insert test user with `user_profiles`
- Insert historical `user_activities` records with different timestamps
- Test different scenarios by modifying the `created_at` timestamps

### Example Scenarios to Test

| Scenario | Last Checkin Time | Expected Status | How to Set Up |
|----------|------------------|-----------------|---------------|
| New user | NULL | "new" | Create user, no activities |
| Active streak | 2 hours ago | "active" | Insert activity 2 hours ago |
| At risk | 21 hours ago | "at_risk" | Insert activity 21 hours ago |
| Broken | 25 hours ago | "broken" | Insert activity 25 hours ago |
| Just checked in | Just now | "active" | Insert activity with `NOW()` |

---

## Strategy 5: Component Testing with Mocked Hooks

### Test the LobbyCheckinStrip Component

Create: `__tests__/unit/components/lobby/checkin-strip.test.tsx`

```typescript
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LobbyCheckinStrip } from "@/components/lobby/checkin-strip";

// Mock the hooks
jest.mock("@/hooks/checkin", () => ({
  useDailyCheckin: jest.fn(),
  useStreakData: jest.fn(),
}));

import { useDailyCheckin, useStreakData } from "@/hooks/checkin";

describe("LobbyCheckinStrip - UI Display", () => {
  const mockUseDailyCheckin = useDailyCheckin as jest.Mock;
  const mockUseStreakData = useStreakData as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("displays active streak count correctly", () => {
    mockUseDailyCheckin.mockReturnValue({
      hasCheckedInToday: false,
      previewXP: 10,
      isLoading: false,
    });

    mockUseStreakData.mockReturnValue({
      streakInfo: {
        currentStreak: 7,
        lastCheckinDate: new Date(),
        longestStreak: 7,
        isActive: true,
      },
      multiplier: 1.5,
      status: "active",
    });

    render(
      <LobbyCheckinStrip
        userAddress="0x123"
        userProfileId="profile-123"
      />,
    );

    expect(screen.getByText(/7 days/)).toBeInTheDocument();
    expect(screen.getByText(/1.5×/)).toBeInTheDocument();
  });

  test("shows check-in button when not checked in today", () => {
    mockUseDailyCheckin.mockReturnValue({
      hasCheckedInToday: false,
      performCheckin: jest.fn(),
      isLoading: false,
    });

    mockUseStreakData.mockReturnValue({
      streakInfo: { currentStreak: 5 },
      multiplier: 1.0,
    });

    render(
      <LobbyCheckinStrip
        userAddress="0x123"
        userProfileId="profile-123"
      />,
    );

    expect(screen.getByText(/Check in/)).toBeInTheDocument();
  });

  test("shows 'Checked in' when user already checked in today", () => {
    mockUseDailyCheckin.mockReturnValue({
      hasCheckedInToday: true,
      previewXP: 10,
      isLoading: false,
    });

    mockUseStreakData.mockReturnValue({
      streakInfo: { currentStreak: 5 },
      multiplier: 1.0,
    });

    render(
      <LobbyCheckinStrip
        userAddress="0x123"
        userProfileId="profile-123"
      />,
    );

    expect(screen.getByText(/Checked in/)).toBeInTheDocument();
  });
});
```

---

## Strategy 6: Time Travel with Jest Timers (Advanced)

### High-Precision Time Control

```typescript
describe("Streak - Time Travel Testing", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("streak status changes as time passes", async () => {
    jest.setSystemTime(new Date("2024-01-15T10:00:00Z"));

    const lastCheckin = new Date("2024-01-14T10:00:00Z");
    let calculator = new DefaultStreakCalculator();

    // Initial state: active
    jest.spyOn(calculator, "getStreakInfo").mockResolvedValue({
      currentStreak: 5,
      lastCheckinDate: lastCheckin,
      longestStreak: 5,
      isActive: true,
    });

    let status = await calculator.getStreakStatus("0x123");
    expect(status).toBe("active");

    // Advance time to 21 hours: at_risk
    jest.setSystemTime(new Date("2024-01-15T07:00:00Z"));
    status = await calculator.getStreakStatus("0x123");
    expect(status).toBe("at_risk");

    // Advance time to 25 hours: broken
    jest.setSystemTime(new Date("2024-01-15T11:00:00Z"));
    status = await calculator.getStreakStatus("0x123");
    expect(status).toBe("broken");
  });
});
```

---

## Quick Reference: Testing Checklist

- [ ] **Unit tests**: Test streak logic with mocked `Date` (5-10 minutes)
- [ ] **Hook tests**: Test React hooks with mocked time (5-10 minutes)
- [ ] **Component tests**: Test UI displays correct streak info (5 minutes)
- [ ] **Integration tests**: Test full flow with local Supabase (10-15 minutes)
- [ ] **Manual testing**: Use DevTools to verify UI behavior (5 minutes)

---

## Common Testing Patterns

### Pattern 1: Mock Current Time
```typescript
const mockTime = new Date("2024-01-15T10:00:00Z");
jest.spyOn(global, "Date").mockImplementation(() => mockTime as any);
(global.Date as any).now = () => mockTime.getTime();
```

### Pattern 2: Create Time Offset
```typescript
const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

mockStreakInfo.lastCheckinDate = hoursAgo(21); // 21 hours ago
```

### Pattern 3: Test Multiple Time Scenarios
```typescript
const timeScenarios = [
  { name: "recent", hoursAgo: 2, expectedStatus: "active" },
  { name: "at_risk", hoursAgo: 21, expectedStatus: "at_risk" },
  { name: "broken", hoursAgo: 25, expectedStatus: "broken" },
];

timeScenarios.forEach(({ name, hoursAgo, expectedStatus }) => {
  test(`status is "${expectedStatus}" when ${name}`, async () => {
    const lastCheckin = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    // ... rest of test
  });
});
```

---

## Running All Streak Tests

```bash
# Unit tests only
npm test -- checkin

# Unit tests with coverage
npm test:coverage -- checkin

# Integration tests
npm test -- --testPathPattern=integration

# Watch mode (recommended for development)
npm test -- --watch
```

---

## Debugging Tips

**1. Print Current Streak Status**
```typescript
console.log("Streak info:", result.current.streakInfo);
console.log("Status:", result.current.status);
console.log("Time until expiration:", result.current.timeUntilExpiration);
```

**2. Check Database State**
```bash
# Connect to local Supabase
supabase studio

# Query user activities
SELECT * FROM user_activities
WHERE activity_type = 'daily_checkin'
ORDER BY created_at DESC;
```

**3. Verify Time Calculations**
```typescript
const now = new Date();
const lastCheckin = new Date(Date.now() - 21 * 60 * 60 * 1000);
const hoursAgo = (now.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60);
console.log(`${hoursAgo} hours since last checkin`);
```

---

## Next Steps

1. **Start with unit tests** (Strategy 1) - fastest feedback loop
2. **Add component tests** (Strategy 5) - verify UI renders correctly
3. **Add integration tests** (Strategy 3) - test full flow once
4. **Manual testing** (Strategy 4) - final verification in browser

This approach lets you test the complete streak feature in under an hour without waiting for actual days to pass.
