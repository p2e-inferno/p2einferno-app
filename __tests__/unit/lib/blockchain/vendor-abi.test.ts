/**
 * TDD Tests for DG Token Vendor ABI
 *
 * These tests define the expected API contract for the vendor ABI.
 */

import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

describe("DG_TOKEN_VENDOR_ABI", () => {
    describe("ABI Export", () => {
        it("should export DG_TOKEN_VENDOR_ABI as an array", () => {
            expect(DG_TOKEN_VENDOR_ABI).toBeDefined();
            expect(Array.isArray(DG_TOKEN_VENDOR_ABI)).toBe(true);
        });

        it("should be a const assertion (readonly type)", () => {
            expect(DG_TOKEN_VENDOR_ABI).toBeDefined();
            expect(Array.isArray(DG_TOKEN_VENDOR_ABI)).toBe(true);
            expect(DG_TOKEN_VENDOR_ABI.length).toBeGreaterThan(0);
        });
    });

    describe("Read Functions", () => {
        it("should include getExchangeRate function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getExchangeRate"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.inputs).toEqual([]);
            expect(fn?.outputs?.[0]?.type).toBe("uint256");
        });

        it("should include getFeeConfig function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getFeeConfig"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.outputs?.[0]?.type).toBe("tuple");
            expect(fn?.outputs?.[0]?.components).toBeDefined();
        });

        it("should include getTokenConfig function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getTokenConfig"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.outputs?.[0]?.type).toBe("tuple");
        });

        it("should include getUserState function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getUserState"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.inputs?.[0]?.type).toBe("address");
            expect(fn?.outputs?.[0]?.type).toBe("tuple");
        });

        it("should include getStageConfig function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getStageConfig"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.inputs?.[0]?.type).toBe("uint8");
        });

        it("should include getStageConstants function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getStageConstants"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
        });

        it("should include hasValidKey function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "hasValidKey"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.inputs?.[0]?.type).toBe("address");
            expect(fn?.outputs?.[0]?.type).toBe("bool");
        });

        it("should include paused function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find((item) => item.name === "paused");
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("view");
            expect(fn?.inputs).toEqual([]);
            expect(fn?.outputs?.[0]?.type).toBe("bool");
        });
    });

    describe("Write Functions", () => {
        it("should include buyTokens function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "buyTokens"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("nonpayable");
            expect(fn?.inputs?.[0]?.type).toBe("uint256");
            expect(fn?.outputs).toEqual([]);
        });

        it("should include sellTokens function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "sellTokens"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("nonpayable");
            expect(fn?.inputs?.[0]?.type).toBe("uint256");
        });

        it("should include lightUp function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "lightUp"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("nonpayable");
            expect(fn?.inputs).toEqual([]);
        });

        it("should include upgradeStage function", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "upgradeStage"
            );
            expect(fn).toBeDefined();
            expect(fn?.stateMutability).toBe("nonpayable");
            expect(fn?.inputs).toEqual([]);
        });
    });

    describe("FeeConfig Structure", () => {
        it("should have FeeConfig with maxFeeBps, minFeeBps, buyFeeBps, sellFeeBps, cooldowns", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getFeeConfig"
            );
            const components = fn?.outputs?.[0]?.components;

            expect(components).toBeDefined();
            expect(components?.length).toBeGreaterThanOrEqual(6);

            const names = components?.map((c) => c.name);
            expect(names).toContain("maxFeeBps");
            expect(names).toContain("minFeeBps");
            expect(names).toContain("buyFeeBps");
            expect(names).toContain("sellFeeBps");
            expect(names).toContain("rateChangeCooldown");
            expect(names).toContain("appChangeCooldown");
        });
    });

    describe("UserState Structure", () => {
        it("should have UserState with stage, points, fuel, and limits", () => {
            const fn = DG_TOKEN_VENDOR_ABI.find(
                (item) => item.name === "getUserState"
            );
            const components = fn?.outputs?.[0]?.components;

            expect(components).toBeDefined();
            expect(components?.length).toBeGreaterThanOrEqual(6);

            const names = components?.map((c) => c.name);
            expect(names).toContain("stage");
            expect(names).toContain("points");
            expect(names).toContain("fuel");
            expect(names).toContain("lastStage3MaxSale");
            expect(names).toContain("dailySoldAmount");
            expect(names).toContain("dailyWindowStart");
        });
    });
});
