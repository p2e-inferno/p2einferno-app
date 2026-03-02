import { evaluateDailyQuestEligibility } from "@/lib/quests/daily-quests/constraints";

declare global {
  // eslint-disable-next-line no-var
  var __DAILY_ELIG_GOODDOLLAR_OK__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_ELIG_HAS_KEY__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_ELIG_VENDOR_STAGE__: number | "throw" | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_ELIG_ERC20_DECIMALS__: number | "throw" | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_ELIG_ERC20_BALANCE__: bigint | "throw" | undefined;
}

global.__DAILY_ELIG_GOODDOLLAR_OK__ = true;
global.__DAILY_ELIG_HAS_KEY__ = true;
global.__DAILY_ELIG_VENDOR_STAGE__ = 2;
global.__DAILY_ELIG_ERC20_DECIMALS__ = 6;
global.__DAILY_ELIG_ERC20_BALANCE__ = 1000000n;

jest.mock("@/lib/quests/prerequisite-checker", () => ({
  checkQuestPrerequisites: jest.fn(async () => ({
    canProceed: Boolean(global.__DAILY_ELIG_GOODDOLLAR_OK__),
  })),
}));

jest.mock("@/lib/services/user-key-service", () => ({
  checkUserKeyOwnership: jest.fn(async () => ({
    hasValidKey: Boolean(global.__DAILY_ELIG_HAS_KEY__),
    checkedAddresses: [],
    errors: [],
  })),
}));

jest.mock("@/lib/blockchain/config/clients/public-client", () => ({
  createPublicClientUnified: jest.fn(() => ({
    readContract: jest.fn(async ({ functionName }: any) => {
      if (functionName === "getUserState") {
        if (global.__DAILY_ELIG_VENDOR_STAGE__ === "throw") {
          throw new Error("vendor read failed");
        }
        return { stage: global.__DAILY_ELIG_VENDOR_STAGE__ };
      }
      if (functionName === "decimals") {
        if (global.__DAILY_ELIG_ERC20_DECIMALS__ === "throw") {
          throw new Error("decimals failed");
        }
        return global.__DAILY_ELIG_ERC20_DECIMALS__;
      }
      if (functionName === "balanceOf") {
        if (global.__DAILY_ELIG_ERC20_BALANCE__ === "throw") {
          throw new Error("balance failed");
        }
        return global.__DAILY_ELIG_ERC20_BALANCE__;
      }
      throw new Error(`Unexpected readContract: ${functionName}`);
    }),
  })),
}));

describe("evaluateDailyQuestEligibility", () => {
  const supabase = {} as any;
  const userId = "did:privy:user1";
  const wallet = "0x00000000000000000000000000000000000000aa";

  beforeEach(() => {
    global.__DAILY_ELIG_GOODDOLLAR_OK__ = true;
    global.__DAILY_ELIG_HAS_KEY__ = true;
    global.__DAILY_ELIG_VENDOR_STAGE__ = 2;
    global.__DAILY_ELIG_ERC20_DECIMALS__ = 6;
    global.__DAILY_ELIG_ERC20_BALANCE__ = 1000000n;
    process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS =
      "0x00000000000000000000000000000000000000bb";
  });

  it("returns eligible when no constraints configured", async () => {
    const res = await evaluateDailyQuestEligibility(
      supabase,
      userId,
      wallet,
      {},
    );
    expect(res.eligible).toBe(true);
    expect(res.failures).toEqual([]);
  });

  it("fails gooddollar_verification when prerequisite check fails", async () => {
    global.__DAILY_ELIG_GOODDOLLAR_OK__ = false;
    const res = await evaluateDailyQuestEligibility(supabase, userId, wallet, {
      requires_gooddollar_verification: true,
    });
    expect(res.eligible).toBe(false);
    expect(res.failures.some((f) => f.type === "gooddollar_verification")).toBe(
      true,
    );
  });

  it("fails lock_key when user does not have a key", async () => {
    global.__DAILY_ELIG_HAS_KEY__ = false;
    const res = await evaluateDailyQuestEligibility(supabase, userId, wallet, {
      required_lock_address: "0x00000000000000000000000000000000000000cc",
    });
    expect(res.eligible).toBe(false);
    expect(res.failures.some((f) => f.type === "lock_key")).toBe(true);
  });

  it("fails wallet_required when wallet-bound constraints configured and wallet missing", async () => {
    const res = await evaluateDailyQuestEligibility(supabase, userId, null, {
      min_vendor_stage: 1,
    });
    expect(res.eligible).toBe(false);
    expect(res.failures).toEqual([
      { type: "wallet_required", message: "Wallet is required to participate" },
    ]);
  });

  it("fails vendor_stage when stage is too low", async () => {
    global.__DAILY_ELIG_VENDOR_STAGE__ = 0;
    const res = await evaluateDailyQuestEligibility(supabase, userId, wallet, {
      min_vendor_stage: 1,
    });
    expect(res.eligible).toBe(false);
    const vendorFailure = res.failures.find((f) => f.type === "vendor_stage");
    expect(vendorFailure?.message).toContain("Requires");
  });

  it("fails vendor_stage with 'Vendor level check unavailable' when read fails", async () => {
    global.__DAILY_ELIG_VENDOR_STAGE__ = "throw";
    const res = await evaluateDailyQuestEligibility(supabase, userId, wallet, {
      min_vendor_stage: 1,
    });
    expect(res.eligible).toBe(false);
    expect(res.failures).toEqual([
      { type: "vendor_stage", message: "Vendor level check unavailable" },
    ]);
  });

  it("fails erc20_balance when balance is below threshold", async () => {
    global.__DAILY_ELIG_ERC20_DECIMALS__ = 6;
    global.__DAILY_ELIG_ERC20_BALANCE__ = 1n; // below 0.02 (20000 raw)
    const res = await evaluateDailyQuestEligibility(supabase, userId, wallet, {
      required_erc20: {
        token: "0x00000000000000000000000000000000000000dd",
        min_balance: "0.02",
      },
    });
    expect(res.eligible).toBe(false);
    expect(res.failures.some((f) => f.type === "erc20_balance")).toBe(true);
  });
});
