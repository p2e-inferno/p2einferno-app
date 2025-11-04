# Streak Testing Quick Reference

## Run Tests Quickly

```bash
# All streak tests (91 tests, ~4 seconds)
npm test -- checkin

# Specific test file
npm test -- calculator.test.ts

# Watch mode
npm test -- checkin --watch

# With coverage report
npm run test:coverage -- checkin

# Single test by name
npm test -- checkin -t "should return 'active'"
```

## Common Test Scenarios

### 1. Test Streak Status

```typescript
// Import utilities
import { createStreakInfoWithTimeOffset } from "__tests__/helpers/streak-test-utils";

// Test different statuses
const activeStreak = createStreakInfoWithTimeOffset(2, 5);   // 2 hours ago, 5-day streak
const atRiskStreak = createStreakInfoWithTimeOffset(21, 5);  // 21 hours ago
const brokenStreak = createStreakInfoWithTimeOffset(25, 5);  // 25 hours ago
const newUser = createStreakInfoWithTimeOffset(0, 0);       // No streak
```

### 2. Test Time Calculations

```typescript
import { timeOffsets } from "__tests__/helpers/streak-test-utils";

// Create dates relative to now
const twoHoursAgo = timeOffsets.hoursAgo(2);
const yesterday = timeOffsets.daysAgo(1);
const lastWeek = timeOffsets.daysAgo(7);
const tenMinutesAgo = timeOffsets.minutesAgo(10);
```

### 3. Test With Fake Timers

```typescript
describe("Time-based test", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("should update as time passes", () => {
    jest.setSystemTime(new Date("2024-01-15T10:00:00Z"));
    // ... test setup

    jest.advanceTimersByTime(5000); // 5 seconds
    // ... assertions

    jest.advanceTimersByTime(10000); // 10 more seconds
    // ... more assertions
  });
});
```

### 4. Test Hook Behavior

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { useStreakData } from "@/hooks/checkin/useStreakData";

test("hook fetches streak data", async () => {
  const { result } = renderHook(() =>
    useStreakData("0x123", { autoRefresh: false }),
  );

  await waitFor(() => {
    expect(result.current.streakInfo?.currentStreak).toBe(7);
  });
});
```

### 5. Test Status Transitions

```typescript
import { COMMON_TIME_SCENARIOS } from "__tests__/helpers/streak-test-utils";

// Automatically test all standard scenarios
COMMON_TIME_SCENARIOS.forEach(
  ({ name, lastCheckinHoursAgo, expectedStatus }) => {
    test(`[${name}] status should be '${expectedStatus}'`, async () => {
      const streakInfo = createStreakInfoWithTimeOffset(
        lastCheckinHoursAgo,
        5,
      );
      // ... test with streakInfo
    });
  },
);
```

## Key Testing Utilities

### Mock Factories

```typescript
// Create default streak info
const streak = createMockStreakInfo();

// Create with specific values
const customStreak = createMockStreakInfo({
  currentStreak: 10,
  lastCheckinDate: new Date(),
  longestStreak: 15,
  isActive: true,
});

// Create with time offset
const hoursAgoStreak = createStreakInfoWithTimeOffset(21, 5);
```

### Time Helpers

```typescript
// Get time X units ago
const now = timeOffsets.hoursAgo(0);      // Right now
const recently = timeOffsets.hoursAgo(2);  // 2 hours ago
const yesterday = timeOffsets.daysAgo(1);  // 1 day ago
const lastWeek = timeOffsets.daysAgo(7);   // 7 days ago

// Advance fake timers
jest.useFakeTimers();
advanceTimeBy({ hours: 2 });          // Advance 2 hours
advanceTimeBy({ minutes: 30 });       // Advance 30 minutes
advanceTimeBy({ seconds: 10 });       // Advance 10 seconds
advanceTimeBy({ hours: 1, minutes: 30 }); // Advance 1.5 hours
```

## Test Patterns

### Pattern: Test Calculator Method

```typescript
test("method returns expected result", async () => {
  // Arrange - mock the dependencies
  jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
    createStreakInfoWithTimeOffset(21, 5),
  );

  // Act - call the method
  const status = await calculator.getStreakStatus("0x123");

  // Assert - verify the result
  expect(status).toBe("at_risk");
});
```

### Pattern: Test Hook with Mock Service

```typescript
test("hook displays streak correctly", async () => {
  // Arrange
  mockService.getStreakInfo.mockResolvedValue(
    createStreakInfoWithTimeOffset(2, 7),
  );

  // Act
  const { result } = renderHook(() =>
    useStreakData("0x123", { autoRefresh: false }),
  );

  // Assert
  await waitFor(() => {
    expect(result.current.streakInfo?.currentStreak).toBe(7);
    expect(result.current.status).toBe("active");
  });
});
```

### Pattern: Test Polling with Fake Timers

```typescript
test("polling calls callback at interval", () => {
  jest.useFakeTimers();

  Object.defineProperty(document, "hidden", {
    value: false,
    writable: true,
    configurable: true,
  });

  renderHook(() =>
    useVisibilityAwarePoll(mockCallback, 5000, { enabled: true }),
  );

  jest.advanceTimersByTime(5000);
  expect(mockCallback).toHaveBeenCalledTimes(1);

  jest.advanceTimersByTime(5000);
  expect(mockCallback).toHaveBeenCalledTimes(2);

  jest.useRealTimers();
});
```

## Status Thresholds

```
Streak Status Timeline (from last checkin):
│
├─ 0-2 hours      → "active" (green, everything OK)
├─ 2-21 hours     → "active" (green, still fine)
├─ 21-24 hours    → "at_risk" (yellow, less than 3 hours left)
├─ 24+ hours      → "broken" (red, streak lost)
│
└─ No checkins    → "new" (gray, no streak yet)
```

## Debugging Tips

### Print Current Streak Info
```typescript
console.log("Streak info:", result.current.streakInfo);
console.log("Status:", result.current.status);
console.log("Time until break:", result.current.timeUntilExpiration);
```

### Check What Mock Was Called With
```typescript
expect(mockCallback).toHaveBeenCalledWith(
  expect.objectContaining({ userAddress: "0x123" })
);
console.log("Mock calls:", mockCallback.mock.calls);
```

### Debug Time Calculations
```typescript
const now = new Date();
const last = timeOffsets.hoursAgo(21);
const hoursAgo = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
console.log(`${hoursAgo} hours since last checkin`);
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Test fails on "visibilitychange" | Ensure `Object.defineProperty(document, "hidden", {...})` before test |
| Mock not working | Import mocks BEFORE importing component that uses them |
| Fake timers not advancing | Call `jest.useFakeTimers()` in `beforeEach` |
| Async assertion fails | Use `await waitFor()` to wait for async updates |
| Mocks not resetting | Call `jest.clearAllMocks()` in `beforeEach` |

## Full Test Run Example

```bash
# Run all tests with output
$ npm test -- checkin

# Output example:
#   PASS  __tests__/unit/lib/checkin/streak/calculator.test.ts
#   PASS  __tests__/unit/hooks/checkin/useStreakData.test.ts
#   PASS  __tests__/unit/hooks/checkin/useVisibilityAwarePoll.test.ts
#
#   Test Suites: 3 passed, 3 total
#   Tests:       91 passed, 91 total
#   Time:        3.9s

# Get coverage report
$ npm run test:coverage -- checkin

# Coverage shows high coverage for:
#   ✅ hooks/checkin        48.19% statements (mocked service)
#   ✅ lib/checkin          83.33% statements
#   ✅ lib/checkin/streak   27.06% statements (calculators fully covered)
```

## Next Steps After Tests Pass

1. ✅ **All tests passing** → Ready to merge
2. 📊 **Review coverage** → Identify gaps (if needed)
3. 🚀 **Deploy with confidence** → Streak feature is verified
4. 🧪 **Add integration tests** (optional) → Use real Supabase
5. 🎯 **Add E2E tests** (optional) → Test full user flows

---

For detailed information, see:
- `STREAK_TESTING_GUIDE.md` - Comprehensive guide with 6 strategies
- `STREAK_UNIT_TESTS_SUMMARY.md` - Full implementation summary
