import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ApplicationPage from "@/pages/apply/[cohortId]";

jest.mock("next/router", () => ({
  useRouter() {
    return {
      push: jest.fn(),
      back: jest.fn(),
    };
  },
}));

// Prevent Supabase client env check from throwing during component import
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

jest.mock("@/hooks/useDashboardData", () => ({
  useDashboardData: () => ({
    data: {
      applications: [],
      enrollments: [
        {
          id: "en-1",
          cohort: {
            id: "co-enrolled",
            bootcamp_program: { id: "boot-1", name: "B1" },
          },
          enrollment_status: "enrolled",
          progress: { modules_completed: 0, total_modules: 8 },
          created_at: "",
          updated_at: "",
        },
      ],
      profile: { id: "u1" },
      recentActivities: [],
      stats: {
        totalApplications: 0,
        completedBootcamps: 0,
        enrolledBootcamps: 1,
        totalPoints: 0,
        pendingPayments: 0,
        questsCompleted: 0,
      },
    },
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

describe("Apply page guard when already enrolled in bootcamp", () => {
  it("renders Already Enrolled guard and CTA", async () => {
    const props: any = {
      cohortId: "co-apply",
      cohort: {
        id: "co-apply",
        bootcamp_program_id: "boot-1",
        name: "C-Apply",
        start_date: "2025-01-01",
        end_date: "2025-02-01",
        max_participants: 100,
        current_participants: 10,
        registration_deadline: "2025-01-15",
        status: "open",
        usdt_amount: 10,
        naira_amount: 5000,
      },
      bootcamp: {
        id: "boot-1",
        name: "B1",
        description: "desc",
        duration_weeks: 8,
        max_reward_dgt: 100,
      },
      registrationStatus: { isOpen: true },
    };

    render(<ApplicationPage {...props} />);

    await waitFor(() => {
      expect(screen.getAllByText(/already enrolled/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/continue learning/i)).toBeInTheDocument();
  });
});
