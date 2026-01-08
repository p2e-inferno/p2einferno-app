/**
 * TDD Tests for QuestTaskForm Vendor Task Types
 *
 * These tests verify that vendor task types are available in the task type options.
 * Tests will FAIL until vendor task types are added to QuestTaskForm.tsx.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Select components
jest.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-mock" data-value={value}>
      {children}
    </div>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

// Mock useDGMarket hook
jest.mock("@/hooks/vendor/useDGMarket", () => ({
  useDGMarket: () => ({
    minBuyAmount: 1000000000000000000n,
    minSellAmount: 500000000000000000n,
  }),
}));

// Mock vendor constants
jest.mock("@/lib/blockchain/shared/vendor-constants", () => ({
  getStageOptions: () => [
    { value: 0, label: "Pleb" },
    { value: 1, label: "Hustler" },
    { value: 2, label: "OG" },
  ],
}));

describe("QuestTaskForm - Vendor Task Types", () => {
  let QuestTaskForm: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/components/admin/QuestTaskForm");
      QuestTaskForm = mod.default;
    } catch {
      // Expected to fail until implemented
    }
  });

  const defaultProps = {
    task: { tempId: "test-1", task_type: "link_email" as const },
    index: 0,
    onUpdate: jest.fn(),
    onRemove: jest.fn(),
    canMoveUp: false,
    canMoveDown: false,
  };

  describe("Vendor Task Type Options", () => {
    it("should include vendor_buy task type option", () => {
      render(<QuestTaskForm {...defaultProps} />);

      // Find the task type button for vendor_buy
      const buyButton = screen.getByRole("button", {
        name: /buy.*dg.*tokens/i,
      });
      expect(buyButton).toBeInTheDocument();
    });

    it("should include vendor_sell task type option", () => {
      render(<QuestTaskForm {...defaultProps} />);

      const sellButton = screen.getByRole("button", {
        name: /sell.*dg.*tokens/i,
      });
      expect(sellButton).toBeInTheDocument();
    });

    it("should include vendor_light_up task type option", () => {
      render(<QuestTaskForm {...defaultProps} />);

      const lightUpButton = screen.getByRole("button", {
        name: /light.*up/i,
      });
      expect(lightUpButton).toBeInTheDocument();
    });

    it("should include vendor_level_up task type option", () => {
      render(<QuestTaskForm {...defaultProps} />);

      const levelUpButton = screen.getByRole("button", {
        name: /level.*up|upgrade.*stage/i,
      });
      expect(levelUpButton).toBeInTheDocument();
    });
  });

  describe("Vendor Task Type Selection", () => {
    it("should call onUpdate with vendor_buy when selected", async () => {
      const onUpdate = jest.fn();
      render(<QuestTaskForm {...defaultProps} onUpdate={onUpdate} />);

      const buyButton = screen.getByRole("button", {
        name: /buy.*dg.*tokens/i,
      });
      await userEvent.click(buyButton);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          task_type: "vendor_buy",
        }),
      );
    });

    it("should call onUpdate with vendor_sell when selected", async () => {
      const onUpdate = jest.fn();
      render(<QuestTaskForm {...defaultProps} onUpdate={onUpdate} />);

      const sellButton = screen.getByRole("button", {
        name: /sell.*dg.*tokens/i,
      });
      await userEvent.click(sellButton);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          task_type: "vendor_sell",
        }),
      );
    });

    it("should call onUpdate with vendor_light_up when selected", async () => {
      const onUpdate = jest.fn();
      render(<QuestTaskForm {...defaultProps} onUpdate={onUpdate} />);

      const lightUpButton = screen.getByRole("button", {
        name: /light.*up/i,
      });
      await userEvent.click(lightUpButton);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          task_type: "vendor_light_up",
        }),
      );
    });

    it("should call onUpdate with vendor_level_up when selected", async () => {
      const onUpdate = jest.fn();
      render(<QuestTaskForm {...defaultProps} onUpdate={onUpdate} />);

      const levelUpButton = screen.getByRole("button", {
        name: /level.*up|upgrade.*stage/i,
      });
      await userEvent.click(levelUpButton);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          task_type: "vendor_level_up",
        }),
      );
    });
  });

  describe("Vendor Task Type Auto-Configuration", () => {
    it("should set verification_method to 'blockchain' for vendor tasks", async () => {
      const onUpdate = jest.fn();
      render(<QuestTaskForm {...defaultProps} onUpdate={onUpdate} />);

      const buyButton = screen.getByRole("button", {
        name: /buy.*dg.*tokens/i,
      });
      await userEvent.click(buyButton);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          verification_method: "blockchain",
        }),
      );
    });

    it("should NOT require admin review for vendor tasks (auto-verified)", async () => {
      const onUpdate = jest.fn();
      render(<QuestTaskForm {...defaultProps} onUpdate={onUpdate} />);

      const buyButton = screen.getByRole("button", {
        name: /buy.*dg.*tokens/i,
      });
      await userEvent.click(buyButton);

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requires_admin_review: false,
        }),
      );
    });
  });
});
