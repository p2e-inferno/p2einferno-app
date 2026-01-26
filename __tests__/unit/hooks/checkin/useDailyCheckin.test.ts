import { renderHook, act } from "@testing-library/react";
import { useDailyCheckin } from "@/hooks/checkin/useDailyCheckin";
import { toast } from "react-hot-toast";

declare global {
  // eslint-disable-next-line no-var
  var __TEST_EAS_ENABLED__: boolean | undefined;
}
global.__TEST_EAS_ENABLED__ = false;

jest.mock("@ethereum-attestation-service/eas-sdk", () => ({
  SchemaEncoder: class SchemaEncoder {
    constructor(_schema: string) {}
    encodeData(_data: any[]) {
      return "0x";
    }
  },
}));

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: { wallet: { address: "0x00000000000000000000000000000000000000aa" } },
  }),
}));

jest.mock("@/hooks/unlock/usePrivyWriteWallet", () => ({
  usePrivyWriteWallet: () => ({}),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: () => Boolean(global.__TEST_EAS_ENABLED__),
}));

const mockSignCheckinAttestation = jest.fn();
jest.mock("@/hooks/checkin/useDelegatedAttestationCheckin", () => ({
  useDelegatedAttestationCheckin: () => ({
    signCheckinAttestation: (...args: any[]) =>
      mockSignCheckinAttestation(...args),
    isSigning: false,
  }),
}));

jest.mock("@/lib/checkin", () => ({
  getDefaultCheckinService: () => ({
    getCheckinStatus: async () => ({
      canCheckin: true,
      hasCheckedInToday: false,
      nextCheckinAvailable: undefined,
      timeUntilNextCheckin: undefined,
    }),
    getCheckinPreview: async () => ({
      currentStreak: 3,
      nextStreak: 4,
      currentMultiplier: 1,
      nextMultiplier: 1,
      previewXP: 150,
      breakdown: {
        baseXP: 100,
        streakBonus: 50,
        multiplier: 1,
        totalXP: 150,
      },
    }),
    validateCheckin: async () => ({ isValid: true }),
    getStreakInfo: async () => ({
      currentStreak: 3,
      lastCheckinDate: null,
      longestStreak: 3,
      isActive: true,
    }),
    getCurrentTier: () => null,
    getNextTier: () => null,
    getProgressToNextTier: () => 0,
    getCurrentMultiplier: () => 1,
  }),
}));

jest.mock("@/lib/attestation/schemas/network-resolver", () => ({
  resolveSchemaUID: jest.fn(async () => "0xschema"),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  getDefaultNetworkName: () => "base-sepolia",
}));

jest.mock("react-hot-toast", () => {
  const toastFn: any = jest.fn();
  toastFn.success = jest.fn();
  toastFn.error = jest.fn();
  return {
    __esModule: true,
    toast: toastFn,
    default: toastFn,
  };
});

describe("useDailyCheckin (Phase 5 verification)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignCheckinAttestation.mockReset();
    global.__TEST_EAS_ENABLED__ = false;
    global.fetch = jest.fn(async () => {
      return {
        json: async () => ({
          success: true,
          xpEarned: 150,
          newStreak: 4,
          attestationUid: null,
          breakdown: {
            baseXP: 100,
            streakBonus: 50,
            multiplier: 1,
            totalXP: 150,
          },
        }),
      } as any;
    }) as any;
  });

  it("uses xpEarned/newStreak from API response (no regression)", async () => {
    const { result } = renderHook(() =>
      useDailyCheckin(
        "0x00000000000000000000000000000000000000aa",
        "profile-1",
        {
          autoRefreshStatus: false,
          showToasts: true,
        },
      ),
    );

    await act(async () => {
      const res = await result.current.performCheckin("GM");
      expect(res.success).toBe(true);
      expect(res.xpEarned).toBe(150);
      expect(res.newStreak).toBe(4);
    });

    expect(toast.success).toHaveBeenCalledWith(
      "Daily check-in complete! +150 XP (Streak: 4 days)",
    );
  });

  it("aborts check-in when EAS is enabled and user cancels signing", async () => {
    global.__TEST_EAS_ENABLED__ = true;

    mockSignCheckinAttestation.mockImplementationOnce(() => {
      const err: any = new Error("User rejected the request.");
      err.code = 4001;
      throw err;
    });

    const { result } = renderHook(() =>
      useDailyCheckin(
        "0x00000000000000000000000000000000000000aa",
        "profile-1",
        {
          autoRefreshStatus: false,
          showToasts: true,
        },
      ),
    );

    await act(async () => {
      const res = await result.current.performCheckin("GM");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Check-in cancelled");
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Check-in cancelled");
  });

  it("stringifies delegated signature bigints and does not send legacy xpAmount", async () => {
    global.__TEST_EAS_ENABLED__ = true;

    mockSignCheckinAttestation.mockResolvedValueOnce({
      signature: "0xsig",
      deadline: 123n,
      attester: "0x00000000000000000000000000000000000000aa",
      recipient: "0x00000000000000000000000000000000000000aa",
      schemaUid: "0xschema",
      data: "0x",
      expirationTime: 0n,
      revocable: false,
      refUID:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      chainId: 84532,
      network: "base-sepolia",
    });

    const { result } = renderHook(() =>
      useDailyCheckin(
        "0x00000000000000000000000000000000000000aa",
        "profile-1",
        {
          autoRefreshStatus: false,
          showToasts: false,
        },
      ),
    );

    await act(async () => {
      const res = await result.current.performCheckin("GM");
      expect(res.success).toBe(true);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const fetchInit = (global.fetch as jest.Mock).mock.calls[0][1] as any;
    const body = JSON.parse(fetchInit.body);

    expect(body).toEqual(
      expect.objectContaining({
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestationSignature: expect.objectContaining({
          deadline: "123",
          expirationTime: "0",
        }),
      }),
    );
    expect(body.xpAmount).toBeUndefined();
  });
});
