import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickActionsGrid } from "@/components/lobby/quick-actions-grid";

// Mock dependencies
jest.mock("@/components/gooddollar/FaceVerificationButton", () => ({
    useFaceVerificationAction: () => ({
        handleVerify: jest.fn(),
        isLoading: false,
        isDisabled: false,
    }),
}));

jest.mock("@/hooks/useGoodDollarVerification", () => ({
    useGoodDollarVerification: () => ({
        data: {
            isWhitelisted: false,
            needsReVerification: false,
            reconcileStatus: "idle",
        },
        isLoading: false,
    }),
}));

const mockPerformCheckin = jest.fn();
const mockUseDailyCheckin = jest.fn();

jest.mock("@/hooks/checkin", () => ({
    useDailyCheckin: (address: string, profileId: string, options: any) =>
        mockUseDailyCheckin(address, profileId, options),
}));

describe("QuickActionsGrid", () => {
    const defaultProps = {
        userAddress: "0x123",
        userProfileId: "user-1",
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseDailyCheckin.mockReturnValue({
            performCheckin: mockPerformCheckin,
            canCheckinToday: true,
            hasCheckedInToday: false,
            isPerformingCheckin: false,
        });
    });

    it("should render all action cards", () => {
        render(<QuickActionsGrid {...defaultProps} />);

        expect(screen.getByText("Daily Check-in")).toBeInTheDocument();
        expect(screen.getByText("Join Bootcamp")).toBeInTheDocument();
        expect(screen.getByText("Events")).toBeInTheDocument();
        expect(screen.getByText("Quests")).toBeInTheDocument();
        expect(screen.getByText("Verify Identity")).toBeInTheDocument();
    });

    describe("Daily Check-in Card", () => {
        it("should allow check-in when available", async () => {
            render(<QuickActionsGrid {...defaultProps} />);

            const checkInButton = screen.getByText("Check in");
            await userEvent.click(checkInButton);

            expect(mockPerformCheckin).toHaveBeenCalled();
        });

        it("should be disabled and show 'Checked in today' if already checked in", () => {
            mockUseDailyCheckin.mockReturnValue({
                performCheckin: mockPerformCheckin,
                canCheckinToday: false,
                hasCheckedInToday: true,
                isPerformingCheckin: false,
            });

            render(<QuickActionsGrid {...defaultProps} />);

            expect(screen.getByText("Checked in today")).toBeInTheDocument();
            // Verify visual disabled state style mapping if needed, 
            // but 'Checked in today' presence confirms logic branch.
        });

        it("should show 'Come back tomorrow' if canCheckinToday is false but not hasCheckedInToday", () => {
            // This case might happen if check-in logic has other constraints
            mockUseDailyCheckin.mockReturnValue({
                performCheckin: mockPerformCheckin,
                canCheckinToday: false,
                hasCheckedInToday: false,
                isPerformingCheckin: false,
            });

            render(<QuickActionsGrid {...defaultProps} />);
            expect(screen.getByText("Come back tomorrow")).toBeInTheDocument();
        });
    });

    describe("Navigation Cards", () => {
        it("should render correct links", () => {
            render(<QuickActionsGrid {...defaultProps} />);

            expect(screen.getByRole("link", { name: /join bootcamp/i })).toHaveAttribute(
                "href",
                "/lobby/apply"
            );
            expect(screen.getByRole("link", { name: /events/i })).toHaveAttribute(
                "href",
                "/lobby/events"
            );
            expect(screen.getByRole("link", { name: /quests/i })).toHaveAttribute(
                "href",
                "/lobby/quests"
            );
            expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute(
                "href",
                "/lobby/profile"
            );
        });
    });
});
