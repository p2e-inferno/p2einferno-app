/**
 * TDD Tests for useDGProfile Hook
 *
 * These tests define the expected API for the DG profile hook.
 * Tests will FAIL until hooks/vendor/useDGProfile.ts is implemented.
 */

import { renderHook, act } from "@testing-library/react";

// Mock wagmi hooks
const mockWriteContract = jest.fn();
const mockRefetchState = jest.fn();

const mockUseWriteContract = jest.fn(() => ({
    writeContract: mockWriteContract,
    data: null,
    isPending: false,
}));

const mockUseReadContract = jest.fn(() => ({
    data: undefined,
    refetch: mockRefetchState,
}));

const mockUseAccount = jest.fn(() => ({
    address: "0x1234567890123456789012345678901234567890",
}));

jest.mock("wagmi", () => ({
    useWriteContract: () => mockUseWriteContract(),
    useReadContract: (config: any) => mockUseReadContract(config),
    useAccount: () => mockUseAccount(),
}));

// Mock the ABI
jest.mock("@/lib/blockchain/shared/vendor-abi", () => ({
    DG_TOKEN_VENDOR_ABI: [],
}));

describe("useDGProfile", () => {
    let useDGProfile: any;

    beforeAll(async () => {
        try {
            const module = await import("@/hooks/vendor/useDGProfile");
            useDGProfile = module.useDGProfile;
        } catch {
            // Expected to fail until implemented
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("Hook Export", () => {
        it("should export useDGProfile function", () => {
            expect(useDGProfile).toBeDefined();
            expect(typeof useDGProfile).toBe("function");
        });
    });

    describe("Return Values", () => {
        it("should return userState object", () => {
            mockUseReadContract.mockReturnValue({
                data: [0, 1000n, 500n, 0n, 0n, 0n], // Tuple from contract
                refetch: mockRefetchState,
            });

            const { result } = renderHook(() => useDGProfile());

            expect(result.current.userState).toBeDefined();
        });

        it("should return upgradeStage function", () => {
            const { result } = renderHook(() => useDGProfile());

            expect(result.current.upgradeStage).toBeDefined();
            expect(typeof result.current.upgradeStage).toBe("function");
        });

        it("should return refetchState function", () => {
            const { result } = renderHook(() => useDGProfile());

            expect(result.current.refetchState).toBeDefined();
            expect(typeof result.current.refetchState).toBe("function");
        });

        it("should return isPending state", () => {
            const { result } = renderHook(() => useDGProfile());

            expect(result.current.isPending).toBeDefined();
            expect(typeof result.current.isPending).toBe("boolean");
        });

        it("should return hash", () => {
            const { result } = renderHook(() => useDGProfile());

            expect("hash" in result.current).toBe(true);
        });
    });

    describe("userState Mapping", () => {
        it("should map tuple result to object with stage", () => {
            mockUseReadContract.mockReturnValue({
                data: [2, 1000n, 500n, 0n, 0n, 0n],
                refetch: mockRefetchState,
            });

            const { result } = renderHook(() => useDGProfile());

            expect(result.current.userState?.stage).toBe(2);
        });

        it("should map tuple result to object with points", () => {
            mockUseReadContract.mockReturnValue({
                data: [0, 1500n, 500n, 0n, 0n, 0n],
                refetch: mockRefetchState,
            });

            const { result } = renderHook(() => useDGProfile());

            expect(result.current.userState?.points).toBe(1500n);
        });

        it("should map tuple result to object with fuel", () => {
            mockUseReadContract.mockReturnValue({
                data: [0, 1000n, 750n, 0n, 0n, 0n],
                refetch: mockRefetchState,
            });

            const { result } = renderHook(() => useDGProfile());

            expect(result.current.userState?.fuel).toBe(750n);
        });

        it("should map tuple result to object with dailySoldAmount", () => {
            mockUseReadContract.mockReturnValue({
                data: [0, 0n, 0n, 0n, 1000n, 0n],
                refetch: mockRefetchState,
            });

            const { result } = renderHook(() => useDGProfile());

            expect(result.current.userState?.dailySoldAmount).toBe(1000n);
        });

        it("should return undefined userState when no data", () => {
            mockUseReadContract.mockReturnValue({
                data: undefined,
                refetch: mockRefetchState,
            });

            const { result } = renderHook(() => useDGProfile());

            expect(result.current.userState).toBeUndefined();
        });
    });

    describe("upgradeStage", () => {
        it("should call writeContract with upgradeStage function", () => {
            const { result } = renderHook(() => useDGProfile());

            act(() => {
                result.current.upgradeStage();
            });

            expect(mockWriteContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    functionName: "upgradeStage",
                })
            );
        });
    });

    describe("Wallet Requirement", () => {
        it("should not fetch userState when wallet not connected", () => {
            mockUseAccount.mockReturnValue({ address: undefined });

            renderHook(() => useDGProfile());

            // Check that useReadContract was called with enabled: false
            expect(mockUseReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: expect.objectContaining({ enabled: false }),
                })
            );
        });

        it("should fetch userState when wallet is connected", () => {
            mockUseAccount.mockReturnValue({
                address: "0x1234567890123456789012345678901234567890",
            });

            renderHook(() => useDGProfile());

            expect(mockUseReadContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: expect.objectContaining({ enabled: true }),
                })
            );
        });
    });
});
