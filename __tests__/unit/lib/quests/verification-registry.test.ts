/**
 * TDD Tests for Verification Registry
 *
 * These tests define the expected behavior for the strategy registry.
 * Tests will FAIL until lib/quests/verification/registry.ts is implemented.
 */

describe("Verification Registry", () => {
  // Will fail until implemented
  let getVerificationStrategy: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/lib/quests/verification/registry");
      getVerificationStrategy = mod.getVerificationStrategy;
    } catch {
      // Expected to fail until implemented
    }
  });

  describe("getVerificationStrategy", () => {
    it("should be a function", () => {
      expect(getVerificationStrategy).toBeDefined();
      expect(typeof getVerificationStrategy).toBe("function");
    });

    it("should return VendorVerificationStrategy for vendor_buy", () => {
      const strategy = getVerificationStrategy("vendor_buy");
      expect(strategy).toBeDefined();
      expect(typeof strategy.verify).toBe("function");
    });

    it("should return VendorVerificationStrategy for vendor_sell", () => {
      const strategy = getVerificationStrategy("vendor_sell");
      expect(strategy).toBeDefined();
      expect(typeof strategy.verify).toBe("function");
    });

    it("should return VendorVerificationStrategy for vendor_light_up", () => {
      const strategy = getVerificationStrategy("vendor_light_up");
      expect(strategy).toBeDefined();
      expect(typeof strategy.verify).toBe("function");
    });

    it("should return VendorVerificationStrategy for vendor_level_up", () => {
      const strategy = getVerificationStrategy("vendor_level_up");
      expect(strategy).toBeDefined();
      expect(typeof strategy.verify).toBe("function");
    });

    it("should return undefined for unsupported task types", () => {
      const strategy = getVerificationStrategy("unsupported_task");
      expect(strategy).toBeUndefined();
    });

    it("should return undefined for non-vendor task types", () => {
      const strategy = getVerificationStrategy("social_share");
      expect(strategy).toBeUndefined();
    });

    it("should return the same strategy instance for same task type (singleton)", () => {
      const strategy1 = getVerificationStrategy("vendor_buy");
      const strategy2 = getVerificationStrategy("vendor_buy");
      expect(strategy1).toBe(strategy2);
    });
  });
});
