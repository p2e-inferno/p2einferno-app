import React from "react";
import PaymentPage from "@/pages/payment/[applicationId]";
import { render, screen } from "@testing-library/react";

jest.mock("next/router", () => ({
  useRouter() {
    return { push: jest.fn() } as any;
  },
}));

jest.mock("next/dynamic", () => () => {
  // Return a stub component instead of actually loading
  return function Stub() {
    return null as any;
  } as any;
});

describe("Payment page guard UI", () => {
  const baseProps: any = {
    applicationId: "app1",
    cohort: { id: "co-1", name: "C1", lock_address: "0xLock" },
    bootcamp: { id: "boot-1", name: "B1" },
  };

  it("shows Payment Completed card instead of redirect", () => {
    const props = {
      ...baseProps,
      enrolledCohortId: "co-1",
      application: {
        id: "app1",
        cohort_id: "co-1",
        user_email: "user@example.com",
        payment_status: "completed",
      },
    };
    render(<PaymentPage {...props} />);
    expect(screen.getByText(/payment completed/i)).toBeInTheDocument();
    expect(screen.getByText(/continue learning/i)).toBeInTheDocument();
  });

  it("shows Already Enrolled card and hides payment UI when pending but enrolled", () => {
    const props = {
      ...baseProps,
      enrolledCohortId: "co-1",
      application: {
        id: "app1",
        cohort_id: "co-1",
        user_email: "user@example.com",
        payment_status: "pending",
      },
    };
    render(<PaymentPage {...props} />);
    expect(screen.getAllByText(/already enrolled/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/continue learning/i)).toBeInTheDocument();
  });
});
