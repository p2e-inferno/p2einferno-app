import { renderHook, act } from "@testing-library/react";
import { useMilestoneClaim } from "@/hooks/useMilestoneClaim";
import { toast } from "react-hot-toast";

declare global {
  // eslint-disable-next-line no-var
  var __TEST_EAS_ENABLED__: boolean | undefined;
}
global.__TEST_EAS_ENABLED__ = false;

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: () => Boolean(global.__TEST_EAS_ENABLED__),
}));

const mockSignAttestation = jest.fn();
jest.mock("@/hooks/attestation/useGaslessAttestation", () => ({
  useGaslessAttestation: () => ({
    signAttestation: (...args: any[]) => mockSignAttestation(...args),
    isSigning: false,
  }),
}));

const mockUseWallets = jest.fn();
jest.mock("@privy-io/react-auth", () => ({
  useWallets: () => mockUseWallets(),
}));

jest.mock("react-hot-toast", () => {
  const toastFn: any = jest.fn();
  toastFn.loading = jest.fn(() => "toast-id");
  toastFn.success = jest.fn();
  toastFn.error = jest.fn();
  return {
    __esModule: true,
    toast: toastFn,
    default: toastFn,
  };
});

describe("useMilestoneClaim (Phase 6 UX)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__TEST_EAS_ENABLED__ = false;
    mockUseWallets.mockReturnValue({ wallets: [{ address: "0xabc" }] });
    mockSignAttestation.mockResolvedValue({ signature: "0xsig" });
    global.fetch = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({ success: true, attestationScanUrl: null }),
      } as any;
    }) as any;
  });

  it("signs milestone_achievement with v2 schema fields", async () => {
    global.__TEST_EAS_ENABLED__ = true;
    mockSignAttestation.mockResolvedValue({ signature: "0xsig" });

    const { result } = renderHook(() =>
      useMilestoneClaim({
        milestone: {
          id: "m1",
          name: "Milestone 1",
          lock_address: "0x00000000000000000000000000000000000000aa",
          total_reward: 123,
        },
        onSuccess: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.claimMilestoneKey();
    });

    expect(mockSignAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "milestone_achievement",
        schemaData: [
          { name: "milestoneId", type: "string", value: "m1" },
          { name: "milestoneTitle", type: "string", value: "Milestone 1" },
          { name: "userAddress", type: "address", value: "0xabc" },
          {
            name: "cohortLockAddress",
            type: "address",
            value: "0x0000000000000000000000000000000000000000",
          },
          {
            name: "milestoneLockAddress",
            type: "address",
            value: "0x00000000000000000000000000000000000000aa",
          },
          { name: "keyTokenId", type: "uint256", value: 0n },
          {
            name: "grantTxHash",
            type: "bytes32",
            value:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
          },
          {
            name: "achievementDate",
            type: "uint256",
            value: expect.any(BigInt),
          },
          { name: "xpEarned", type: "uint256", value: 123n },
          { name: "skillLevel", type: "string", value: "" },
        ],
      }),
    );
  });

  it("does not call API when user rejects signature (claim cancelled)", async () => {
    global.__TEST_EAS_ENABLED__ = true;
    mockSignAttestation.mockRejectedValue({
      code: 4001,
      message: "User rejected",
    });

    const { result } = renderHook(() =>
      useMilestoneClaim({
        milestone: { id: "m1", name: "Milestone 1" },
        onSuccess: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.claimMilestoneKey();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Claim cancelled", {
      id: "toast-id",
    });
  });
});
