/**
 * TDD Tests for QuestForm GoodDollar Verification Toggle
 *
 * These tests verify that the requires_gooddollar_verification toggle exists.
 * Tests will FAIL until the toggle is added to QuestForm.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock router
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    query: {},
  }),
}));

// Mock necessary hooks
jest.mock("@/hooks/unlock/useDeployAdminLock", () => ({
  useDeployAdminLock: () => ({
    deployLock: jest.fn(),
    isDeploying: false,
    error: null,
  }),
}));

jest.mock("@/contexts/admin-context", () => ({
  useAdminAuthContext: () => ({
    adminAddress: "0x1234",
    isAdmin: true,
  }),
}));

jest.mock("@/hooks/useLockManagerState", () => ({
  useLockManagerState: () => ({
    isGranted: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

describe("QuestForm - GoodDollar Verification Toggle", () => {
  let QuestForm: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/components/admin/QuestForm");
      QuestForm = mod.default;
    } catch {
      // Expected to fail until implemented
    }
  });

  describe("Verification Toggle Rendering", () => {
    it("should render a toggle for requires_gooddollar_verification", () => {
      render(<QuestForm />);

      // Look for the toggle/switch for GoodDollar verification
      const verificationToggle = screen.getByRole("switch", {
        name: /requires.*verification|gooddollar.*verification/i,
      });
      expect(verificationToggle).toBeInTheDocument();
    });

    it("should render label for the verification toggle", () => {
      render(<QuestForm />);

      const label = screen.getByText(/requires.*verification/i);
      expect(label).toBeInTheDocument();
    });
  });

  describe("Verification Toggle Interaction", () => {
    it("should toggle verification requirement on click", async () => {
      render(<QuestForm />);

      const toggle = screen.getByRole("switch", {
        name: /requires.*verification|gooddollar.*verification/i,
      });

      // Initially should be unchecked
      expect(toggle).not.toBeChecked();

      // Click to enable
      await userEvent.click(toggle);

      // Should now be checked
      expect(toggle).toBeChecked();
    });
  });

  describe("Verification Toggle with Existing Quest", () => {
    it("should reflect quest.requires_gooddollar_verification when editing", () => {
      const existingQuest = {
        id: "quest-1",
        title: "Test Quest",
        description: "A test quest",
        total_reward: 1000,
        is_active: true,
        requires_gooddollar_verification: true,
        quest_tasks: [],
      };

      render(<QuestForm quest={existingQuest} isEditing={true} />);

      const toggle = screen.getByRole("switch", {
        name: /requires.*verification|gooddollar.*verification/i,
      });

      // Should be checked because quest has it set to true
      expect(toggle).toBeChecked();
    });

    it("should default to unchecked when creating new quest", () => {
      render(<QuestForm />);

      const toggle = screen.getByRole("switch", {
        name: /requires.*verification|gooddollar.*verification/i,
      });

      expect(toggle).not.toBeChecked();
    });
  });
});
