/**
 * TDD Tests for LevelUpCard Component
 *
 * These tests define the expected behavior for the LevelUpCard UI component.
 * Tests will FAIL until components/vendor/LevelUpCard.tsx is implemented.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the hook
const mockUpgradeStage = jest.fn();
const mockRefetchState = jest.fn();
const mockUseDGProfile = jest.fn();

jest.mock("@/hooks/vendor/useDGProfile", () => ({
  useDGProfile: () => mockUseDGProfile(),
}));

describe("LevelUpCard", () => {
  let LevelUpCard: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/components/vendor/LevelUpCard");
      LevelUpCard = mod.default;
    } catch {
      // Expected to fail until implemented
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseDGProfile.mockReturnValue({
      userState: {
        stage: 1,
        points: 500n,
        fuel: 200n,
        lastStage3MaxSale: 0n,
        dailySoldAmount: 0n,
        dailyWindowStart: 0n,
      },
      stageLabel: "Hustler",
      isKeyHolder: true,
      isPaused: false,
      canUpgrade: true,
      upgradeBlockedReason: null,
      pointsProgress: 0.5,
      fuelProgress: 0.4,
      upgradeProgress: 0.4,
      pointsRequired: 1000n,
      fuelRequired: 500n,
      nextStage: 2,
      upgradeStage: mockUpgradeStage,
      refetchState: mockRefetchState,
      isPending: false,
      hash: null,
    });
  });

  describe("Component Export", () => {
    it("should export LevelUpCard as default export", () => {
      expect(LevelUpCard).toBeDefined();
    });
  });

  describe("Rendering", () => {
    it("should render the card with level/stage information", () => {
      render(<LevelUpCard />);
      expect(screen.getByText(/Stage Progress/i)).toBeInTheDocument();
    });

    it("should display current points", () => {
      render(<LevelUpCard />);
      expect(
        screen.getAllByText(/points/i, { exact: false }).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("should display current fuel", () => {
      render(<LevelUpCard />);
      expect(
        screen.getAllByText(/fuel/i, { exact: false }).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("should render an upgrade button", () => {
      render(<LevelUpCard />);
      expect(
        screen.getByRole("button", { name: /upgrade/i }),
      ).toBeInTheDocument();
    });
  });

  describe("User State Display", () => {
    it("should display the current stage value", () => {
      render(<LevelUpCard />);
      // Stage label from mock
      expect(screen.getByText("Hustler")).toBeInTheDocument();
    });

    it("should handle undefined userState gracefully", () => {
      mockUseDGProfile.mockReturnValue({
        userState: undefined,
        stageLabel: "Unknown",
        isKeyHolder: true,
        isPaused: false,
        canUpgrade: false,
        upgradeBlockedReason: "Insufficient points",
        pointsProgress: 0,
        fuelProgress: 0,
        upgradeProgress: 0,
        pointsRequired: undefined,
        fuelRequired: undefined,
        nextStage: 1,
        upgradeStage: mockUpgradeStage,
        refetchState: mockRefetchState,
        isPending: false,
        hash: null,
      });

      render(<LevelUpCard />);
      // Should render without crashing
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("User Interaction", () => {
    it("should call upgradeStage when upgrade button is clicked", async () => {
      render(<LevelUpCard />);
      const button = screen.getByRole("button", { name: /upgrade/i });

      await userEvent.click(button);

      expect(mockUpgradeStage).toHaveBeenCalledTimes(1);
    });
  });

  describe("Loading State", () => {
    it("should disable upgrade button when isPending is true", () => {
      mockUseDGProfile.mockReturnValue({
        userState: { stage: 1, points: 500n, fuel: 200n },
        stageLabel: "Hustler",
        isKeyHolder: true,
        isPaused: false,
        canUpgrade: false,
        upgradeBlockedReason: "Insufficient points",
        pointsProgress: 0.5,
        fuelProgress: 0.4,
        upgradeProgress: 0.4,
        pointsRequired: 1000n,
        fuelRequired: 500n,
        nextStage: 2,
        upgradeStage: mockUpgradeStage,
        refetchState: mockRefetchState,
        isPending: true,
        hash: null,
      });

      render(<LevelUpCard />);
      const button = screen.getByRole("button");

      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/upgrading/i);
    });
  });

  describe("Progress Display", () => {
    it("should show progress towards next level", () => {
      render(<LevelUpCard />);
      // Should display some form of progress indicator
      expect(screen.getByText(/Progress to next stage/i)).toBeInTheDocument();
    });
  });
});
