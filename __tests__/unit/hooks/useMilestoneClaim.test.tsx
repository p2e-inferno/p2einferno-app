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

describe("useMilestoneClaim (milestone key claim proof)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__TEST_EAS_ENABLED__ = false;
    mockSignAttestation.mockResolvedValue({ signature: "0xsig" });
  });

  it("signs milestone_achievement using server-provided grant tx + tokenId", async () => {
    global.__TEST_EAS_ENABLED__ = true;
    mockSignAttestation.mockResolvedValue({ signature: "0xsig" });

    const fetchMock = jest
      .fn()
      .mockImplementationOnce(async () => {
        return {
          ok: true,
          json: async () => ({
            success: true,
            transactionHash: "0xgrant",
            keyTokenId: "42",
            attestationRequired: true,
            attestationPayload: {
              schemaKey: "milestone_achievement",
              recipient: "0xabc",
              schemaData: [
                { name: "milestoneId", type: "string", value: "m1" },
                {
                  name: "milestoneTitle",
                  type: "string",
                  value: "Milestone 1",
                },
                { name: "userAddress", type: "address", value: "0xabc" },
                {
                  name: "cohortLockAddress",
                  type: "address",
                  value: "0x00000000000000000000000000000000000000cc",
                },
                {
                  name: "milestoneLockAddress",
                  type: "address",
                  value: "0x00000000000000000000000000000000000000aa",
                },
                { name: "keyTokenId", type: "uint256", value: "42" },
                { name: "grantTxHash", type: "bytes32", value: "0xgrant" },
                { name: "achievementDate", type: "uint256", value: "123" },
                { name: "xpEarned", type: "uint256", value: "123" },
                { name: "skillLevel", type: "string", value: "" },
              ],
            },
          }),
        } as any;
      })
      .mockImplementationOnce(async () => {
        return {
          ok: true,
          json: async () => ({
            success: true,
            attestationUid: "0xuid",
            attestationScanUrl: "https://scan/0xuid",
          }),
        } as any;
      });
    global.fetch = fetchMock as any;

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
        recipient: "0xabc",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows success but marks proof cancelled when user rejects proof signature", async () => {
    global.__TEST_EAS_ENABLED__ = true;
    mockSignAttestation.mockRejectedValue({
      code: 4001,
      message: "User rejected",
    });

    const fetchMock = jest.fn().mockImplementationOnce(async () => {
      return {
        ok: true,
        json: async () => ({
          success: true,
          transactionHash: "0xgrant",
          keyTokenId: "42",
          attestationRequired: true,
          attestationPayload: {
            schemaKey: "milestone_achievement",
            recipient: "0xabc",
            schemaData: [
              { name: "milestoneId", type: "string", value: "m1" },
              { name: "milestoneTitle", type: "string", value: "Milestone 1" },
              { name: "userAddress", type: "address", value: "0xabc" },
              {
                name: "cohortLockAddress",
                type: "address",
                value: "0x00000000000000000000000000000000000000cc",
              },
              {
                name: "milestoneLockAddress",
                type: "address",
                value: "0x00000000000000000000000000000000000000aa",
              },
              { name: "keyTokenId", type: "uint256", value: "42" },
              { name: "grantTxHash", type: "bytes32", value: "0xgrant" },
              { name: "achievementDate", type: "uint256", value: "123" },
              { name: "xpEarned", type: "uint256", value: "123" },
              { name: "skillLevel", type: "string", value: "" },
            ],
          },
        }),
      } as any;
    });
    global.fetch = fetchMock as any;

    const { result } = renderHook(() =>
      useMilestoneClaim({
        milestone: { id: "m1", name: "Milestone 1" },
        onSuccess: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.claimMilestoneKey();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();

    const rendered = (toast.success as any).mock.calls[0][0];
    expect(JSON.stringify(rendered)).toContain(
      "Completion proof cancelled — claim completed.",
    );
  });
});
