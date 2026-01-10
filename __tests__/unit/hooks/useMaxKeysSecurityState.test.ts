import { renderHook, act } from "@testing-library/react";
import { useMaxKeysSecurityState } from "@/hooks/useMaxKeysSecurityState";

describe("useMaxKeysSecurityState", () => {
  describe("creating new entity", () => {
    it("defaults to false when creating new entity", () => {
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(false, undefined),
      );
      expect(result.current.maxKeysSecured).toBe(false);
      expect(result.current.maxKeysFailureReason).toBeUndefined();
    });

    it("ignores entity data when creating new", () => {
      const entity = {
        max_keys_secured: true,
        max_keys_failure_reason: "Error",
      };
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(false, entity),
      );
      expect(result.current.maxKeysSecured).toBe(false);
    });
  });

  describe("editing existing entity", () => {
    it("initializes from entity when editing (secured)", () => {
      const entity = { max_keys_secured: true };
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(true, entity),
      );
      expect(result.current.maxKeysSecured).toBe(true);
      expect(result.current.maxKeysFailureReason).toBeUndefined();
    });

    it("initializes from entity when editing (not secured)", () => {
      const entity = {
        max_keys_secured: false,
        max_keys_failure_reason: "Config failed",
      };
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(true, entity),
      );
      expect(result.current.maxKeysSecured).toBe(false);
      expect(result.current.maxKeysFailureReason).toBe("Config failed");
    });

    it("coalesces undefined max_keys_secured to false when editing", () => {
      const entity = { max_keys_secured: undefined };
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(true, entity),
      );
      expect(result.current.maxKeysSecured).toBe(false);
    });
  });

  describe("state synchronization", () => {
    it("syncs state when entity changes during edit mode", () => {
      const entity1 = {
        max_keys_secured: false,
        max_keys_failure_reason: "Error 1",
      };
      const { result, rerender } = renderHook(
        ({ isEditing, entity }) => useMaxKeysSecurityState(isEditing, entity),
        { initialProps: { isEditing: true, entity: entity1 } },
      );

      expect(result.current.maxKeysSecured).toBe(false);
      expect(result.current.maxKeysFailureReason).toBe("Error 1");

      const entity2 = {
        max_keys_secured: true,
        max_keys_failure_reason: null as any,
      };
      rerender({ isEditing: true, entity: entity2 });

      expect(result.current.maxKeysSecured).toBe(true);
      expect(result.current.maxKeysFailureReason).toBeUndefined();
    });

    it("does not sync when not in edit mode", () => {
      const entity1 = { max_keys_secured: false };
      const { result, rerender } = renderHook(
        ({ entity }) => useMaxKeysSecurityState(false, entity),
        { initialProps: { entity: entity1 } },
      );

      expect(result.current.maxKeysSecured).toBe(false);

      const entity2 = { max_keys_secured: true };
      rerender({ entity: entity2 });

      // Should still be false (create mode ignores entity)
      expect(result.current.maxKeysSecured).toBe(false);
    });
  });

  describe("manual state updates", () => {
    it("allows manual state updates via setters", () => {
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(false, undefined),
      );

      act(() => {
        result.current.setMaxKeysSecured(true);
        result.current.setMaxKeysFailureReason("Manual error");
      });

      expect(result.current.maxKeysSecured).toBe(true);
      expect(result.current.maxKeysFailureReason).toBe("Manual error");
    });
  });

  describe("null coalescing", () => {
    it("coalesces null failure_reason to undefined", () => {
      const entity = {
        max_keys_secured: false,
        max_keys_failure_reason: null,
      };
      const { result } = renderHook(() =>
        useMaxKeysSecurityState(true, entity),
      );
      expect(result.current.maxKeysFailureReason).toBeUndefined();
    });
  });

  describe("mode switching", () => {
    it("updates state when switching from create to edit mode", () => {
      const entity = { max_keys_secured: true } as any;
      const { result, rerender } = renderHook(
        ({ isEditing, entity }) => useMaxKeysSecurityState(isEditing, entity),
        { initialProps: { isEditing: false, entity: undefined } },
      );

      expect(result.current.maxKeysSecured).toBe(false);

      rerender({ isEditing: true, entity });

      expect(result.current.maxKeysSecured).toBe(true);
    });
  });
});
