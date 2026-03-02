import { DailyCheckinVerificationStrategy } from "@/lib/quests/verification/daily-checkin-verification";

declare global {
  // eslint-disable-next-line no-var
  var __DAILY_CHECKIN_CAN_CHECKIN_TODAY__: boolean | "throw" | undefined;
}

global.__DAILY_CHECKIN_CAN_CHECKIN_TODAY__ = true;

jest.mock("@/lib/checkin", () => ({
  getDefaultCheckinService: jest.fn(() => ({
    canCheckinToday: jest.fn(async () => {
      if (global.__DAILY_CHECKIN_CAN_CHECKIN_TODAY__ === "throw") {
        throw new Error("rpc failed");
      }
      return Boolean(global.__DAILY_CHECKIN_CAN_CHECKIN_TODAY__);
    }),
  })),
}));

describe("DailyCheckinVerificationStrategy", () => {
  it("returns WALLET_REQUIRED when userAddress is missing", async () => {
    const strategy = new DailyCheckinVerificationStrategy();
    const result = await strategy.verify(
      "daily_checkin" as any,
      {},
      "user-1",
      "",
      {},
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("WALLET_REQUIRED");
  });

  it("returns CHECKIN_NOT_FOUND when user has not checked in yet today", async () => {
    global.__DAILY_CHECKIN_CAN_CHECKIN_TODAY__ = true; // can still check in => no checkin yet
    const strategy = new DailyCheckinVerificationStrategy();
    const result = await strategy.verify(
      "daily_checkin" as any,
      {},
      "user-1",
      "0x00000000000000000000000000000000000000aa",
      {},
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("CHECKIN_NOT_FOUND");
  });

  it("returns success when user has checked in today", async () => {
    global.__DAILY_CHECKIN_CAN_CHECKIN_TODAY__ = false; // cannot check in => already checked in
    const strategy = new DailyCheckinVerificationStrategy();
    const result = await strategy.verify(
      "daily_checkin" as any,
      {},
      "user-1",
      "0x00000000000000000000000000000000000000aa",
      {},
    );
    expect(result.success).toBe(true);
  });

  it("returns CHECKIN_VERIFICATION_ERROR when canCheckinToday throws", async () => {
    global.__DAILY_CHECKIN_CAN_CHECKIN_TODAY__ = "throw";
    const strategy = new DailyCheckinVerificationStrategy();
    const result = await strategy.verify(
      "daily_checkin" as any,
      {},
      "user-1",
      "0x00000000000000000000000000000000000000aa",
      {},
    );
    expect(result.success).toBe(false);
    expect(result.code).toBe("CHECKIN_VERIFICATION_ERROR");
  });
});
