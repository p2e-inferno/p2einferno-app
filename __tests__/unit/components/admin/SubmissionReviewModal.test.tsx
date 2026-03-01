import React from "react";
import { render, screen } from "@testing-library/react";
import SubmissionReviewModal from "@/components/admin/SubmissionReviewModal";

describe("SubmissionReviewModal - AI context", () => {
  const baseSubmission: any = {
    id: "sub-1",
    user_id: "user-1",
    task_id: "task-1",
    submission_data: "https://example.com/proof.png",
    submission_status: "pending",
    admin_feedback: null,
    completed_at: new Date("2026-02-28T00:00:00.000Z").toISOString(),
    task: { id: "task-1", title: "Submit Proof", task_type: "submit_proof" },
    user: { id: "user-1", email: "test@example.com" },
  };

  it("renders AI verification context when verification_data indicates AI", () => {
    render(
      <SubmissionReviewModal
        submission={{
          ...baseSubmission,
          verification_data: {
            verificationMethod: "ai",
            aiDecision: "defer",
            aiConfidence: 0.62,
            aiReason: "The screenshot is too blurry to confirm completion.",
            aiModel: "google/gemini-2.0-flash-001",
            verifiedAt: new Date("2026-02-28T00:00:00.000Z").toISOString(),
          },
        }}
        isOpen={true}
        onClose={() => {}}
        onStatusUpdate={async () => {}}
      />,
    );

    expect(screen.getByText("AI Verification")).toBeInTheDocument();
    expect(screen.getByText(/Decision:/i)).toBeInTheDocument();
    expect(screen.getByText(/Confidence:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/too blurry to confirm completion/i),
    ).toBeInTheDocument();
  });

  it("does not render AI verification context for non-AI submissions", () => {
    render(
      <SubmissionReviewModal
        submission={{
          ...baseSubmission,
          verification_data: { verificationMethod: "blockchain" },
        }}
        isOpen={true}
        onClose={() => {}}
        onStatusUpdate={async () => {}}
      />,
    );

    expect(screen.queryByText("AI Verification")).not.toBeInTheDocument();
  });
});
