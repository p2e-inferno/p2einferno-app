import {
  initialGrantState,
  applyDeploymentOutcome,
  effectiveGrantForSave,
  effectiveMaxKeysForSave,
} from "@/lib/blockchain/shared/grant-state";

describe("grant-state", () => {
  describe("initialGrantState", () => {
    it("returns true when editing with existing true value", () => {
      expect(initialGrantState(true, true)).toBe(true);
    });

    it("returns false when editing with existing false value", () => {
      expect(initialGrantState(true, false)).toBe(false);
    });

    it("returns false when editing without value", () => {
      expect(initialGrantState(true, undefined)).toBe(false);
    });

    it("returns false when creating new (ignores existing)", () => {
      expect(initialGrantState(false, true)).toBe(false);
      expect(initialGrantState(false, false)).toBe(false);
      expect(initialGrantState(false, undefined)).toBe(false);
    });

    it("always defaults to false for security", () => {
      expect(initialGrantState(false, undefined)).toBe(false);
    });
  });

  describe("applyDeploymentOutcome", () => {
    it("returns granted:true when both undefined", () => {
      const result = applyDeploymentOutcome({});
      expect(result).toEqual({
        granted: true,
        reason: undefined,
        lastGrantFailed: false,
        lastGrantError: undefined,
      });
    });

    it("returns granted:true when both false", () => {
      const result = applyDeploymentOutcome({
        grantFailed: false,
        configFailed: false,
      });
      expect(result).toEqual({
        granted: true,
        reason: undefined,
        lastGrantFailed: false,
        lastGrantError: undefined,
      });
    });

    it("returns granted:false when grant failed", () => {
      const result = applyDeploymentOutcome({
        grantFailed: true,
        grantError: "Grant tx reverted",
      });
      expect(result).toEqual({
        granted: false,
        reason: "Grant tx reverted",
        lastGrantFailed: true,
        lastGrantError: "Grant tx reverted",
      });
    });

    it("returns granted:true when only config failed", () => {
      const result = applyDeploymentOutcome({
        grantFailed: false,
        configFailed: true,
        configError: "Config tx reverted",
      });
      expect(result.granted).toBe(true);
      expect(result.reason).toContain("config update failed");
    });

    it("provides default grant error message when missing", () => {
      const result = applyDeploymentOutcome({ grantFailed: true });
      expect(result.reason).toBe("Grant manager transaction failed");
    });

    it("combines errors when both grant and config failed", () => {
      const result = applyDeploymentOutcome({
        grantFailed: true,
        grantError: "Grant error",
        configFailed: true,
        configError: "Config error",
      });
      expect(result.granted).toBe(false);
      expect(result.reason).toContain("Grant error");
      expect(result.reason).toContain("Config error");
    });
  });

  describe("effectiveGrantForSave", () => {
    it("uses outcome when lastGrantFailed is defined", () => {
      const result = effectiveGrantForSave({
        outcome: { lastGrantFailed: true, lastGrantError: "Error" },
        lockAddress: "0x123",
        currentGranted: true,
      });
      expect(result).toEqual({ granted: false, reason: "Error" });
    });

    it("uses outcome when grant succeeded", () => {
      const result = effectiveGrantForSave({
        outcome: { lastGrantFailed: false },
        lockAddress: "0x123",
        currentGranted: false,
      });
      expect(result).toEqual({ granted: true, reason: undefined });
    });

    it("uses currentGranted when no outcome and lock exists", () => {
      const result = effectiveGrantForSave({
        lockAddress: "0x123",
        currentGranted: true,
      });
      expect(result).toEqual({ granted: true, reason: undefined });
    });

    it("uses currentReason when not granted", () => {
      const result = effectiveGrantForSave({
        lockAddress: "0x123",
        currentGranted: false,
        currentReason: "Previous failure",
      });
      expect(result).toEqual({ granted: false, reason: "Previous failure" });
    });

    it("defaults to false when no lock address", () => {
      const result = effectiveGrantForSave({
        lockAddress: null,
        currentGranted: true,
      });
      expect(result).toEqual({ granted: false, reason: undefined });
    });

    it("outcome overrides current state", () => {
      const result = effectiveGrantForSave({
        outcome: { lastGrantFailed: false },
        lockAddress: "0x123",
        currentGranted: false,
      });
      expect(result.granted).toBe(true);
    });
  });

  describe("effectiveMaxKeysForSave", () => {
    describe("outcome-based priority", () => {
      it("uses outcome when lastConfigFailed is true", () => {
        const result = effectiveMaxKeysForSave({
          outcome: {
            lastConfigFailed: true,
            lastConfigError: "Config tx reverted",
          },
          lockAddress: "0x123",
          currentSecured: true,
        });
        expect(result).toEqual({
          secured: false,
          reason: "Config tx reverted",
        });
      });

      it("uses outcome when lastConfigFailed is false", () => {
        const result = effectiveMaxKeysForSave({
          outcome: { lastConfigFailed: false },
          lockAddress: "0x123",
          currentSecured: false,
        });
        expect(result).toEqual({
          secured: true,
          reason: undefined,
        });
      });

      it("provides default error message when outcome failed without message", () => {
        const result = effectiveMaxKeysForSave({
          outcome: { lastConfigFailed: true },
          lockAddress: "0x123",
        });
        expect(result).toEqual({
          secured: false,
          reason: "Lock config update failed - maxNumberOfKeys not set to 0",
        });
      });
    });

    describe("current state fallback", () => {
      it("uses currentSecured when no outcome and lock exists (secured)", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: "0x123",
          currentSecured: true,
        });
        expect(result).toEqual({ secured: true, reason: undefined });
      });

      it("uses currentSecured when no outcome and lock exists (not secured)", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: "0x123",
          currentSecured: false,
          currentReason: "Previous config failure",
        });
        expect(result).toEqual({
          secured: false,
          reason: "Previous config failure",
        });
      });

      it("coalesces null currentReason to undefined", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: "0x123",
          currentSecured: false,
          currentReason: null,
        });
        expect(result).toEqual({ secured: false, reason: undefined });
      });
    });

    describe("no lock default", () => {
      it("defaults to unsecured when lockAddress is null", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: null,
          currentSecured: true,
        });
        expect(result).toEqual({ secured: false, reason: undefined });
      });

      it("defaults to unsecured when lockAddress is undefined", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: undefined,
          currentSecured: true,
        });
        expect(result).toEqual({ secured: false, reason: undefined });
      });
    });

    describe("outcome priority", () => {
      it("outcome overrides currentSecured even when different", () => {
        const result = effectiveMaxKeysForSave({
          outcome: { lastConfigFailed: false },
          lockAddress: "0x123",
          currentSecured: false,
        });
        expect(result).toEqual({ secured: true, reason: undefined });
      });
    });

    describe("edge cases", () => {
      it("empty string currentReason becomes undefined", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: "0x123",
          currentSecured: false,
          currentReason: "",
        });
        expect(result).toEqual({ secured: false, reason: undefined });
      });

      it("handles currentSecured undefined as false", () => {
        const result = effectiveMaxKeysForSave({
          lockAddress: "0x123",
          currentSecured: undefined,
        });
        expect(result.secured).toBe(false);
      });
    });
  });
});
