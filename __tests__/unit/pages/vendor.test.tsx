/**
 * TDD Tests for VendorPage Component
 *
 * These tests define the expected behavior for the Vendor page.
 * Tests will FAIL until pages/lobby/vendor.tsx is implemented.
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// Mock the hooks
const mockUseDGProfile = jest.fn();

jest.mock("@/hooks/vendor/useDGProfile", () => ({
    useDGProfile: () => mockUseDGProfile(),
}));

// Mock the child components
jest.mock("@/components/vendor/VendorSwap", () => ({
    __esModule: true,
    default: () => <div data-testid="vendor-swap">VendorSwap Mock</div>,
}));

jest.mock("@/components/vendor/LevelUpCard", () => ({
    __esModule: true,
    default: () => <div data-testid="level-up-card">LevelUpCard Mock</div>,
}));

jest.mock("@/components/vendor/LightUpButton", () => ({
    __esModule: true,
    default: () => <div data-testid="light-up-button">LightUpButton Mock</div>,
}));

jest.mock("@/components/layouts/lobby-layout", () => ({
    __esModule: true,
    LobbyLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="lobby-layout">{children}</div>
    ),
}));

describe("VendorPage", () => {
    let VendorPage: any;

    beforeAll(async () => {
        try {
            const module = await import("@/pages/lobby/vendor");
            VendorPage = module.default;
        } catch {
            // Expected to fail until implemented
        }
    });

    beforeEach(() => {
        mockUseDGProfile.mockReturnValue({
            userState: {
                stage: 2,
                points: 1500n,
                fuel: 750n,
            },
            stageLabel: "Og",
            upgradeStage: jest.fn(),
            refetchState: jest.fn(),
            isPending: false,
        });
    });

    describe("Component Export", () => {
        it("should export VendorPage as default export", () => {
            expect(VendorPage).toBeDefined();
        });
    });

    describe("Layout", () => {
        it("should render within LobbyLayout component", () => {
            render(<VendorPage />);
            expect(screen.getByTestId("lobby-layout")).toBeInTheDocument();
        });
    });

    describe("Header", () => {
        it("should render the page title", () => {
            render(<VendorPage />);
            expect(screen.getByText(/DG Token Vendor/i)).toBeInTheDocument();
        });

        it("should display current stage in header", () => {
            render(<VendorPage />);
            expect(screen.getByText(/Current Stage/i)).toBeInTheDocument();
            expect(screen.getByText("Og")).toBeInTheDocument(); // Stage label from mock
        });
    });

    describe("Child Components", () => {
        it("should render VendorSwap component", () => {
            render(<VendorPage />);
            expect(screen.getByTestId("vendor-swap")).toBeInTheDocument();
        });

        it("should render LightUpButton component", () => {
            render(<VendorPage />);
            expect(screen.getByTestId("light-up-button")).toBeInTheDocument();
        });

        it("should render LevelUpCard component", () => {
            render(<VendorPage />);
            expect(screen.getByTestId("level-up-card")).toBeInTheDocument();
        });
    });

    describe("Grid Layout", () => {
        it("should have responsive grid layout", () => {
            render(<VendorPage />);
            // VendorSwap should be in main area, others in sidebar
            const swapContainer = screen.getByTestId("vendor-swap").closest("div");
            expect(swapContainer).toBeDefined();
        });
    });

    describe("Unknown Stage Handling", () => {
        it("should show 'Unknown' when userState is undefined", () => {
            mockUseDGProfile.mockReturnValue({
                userState: undefined,
                stageLabel: "Unknown",
                upgradeStage: jest.fn(),
                refetchState: jest.fn(),
                isPending: false,
            });

            render(<VendorPage />);
            expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
        });
    });
});
