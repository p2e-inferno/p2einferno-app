import {
  getPaymentSuccessEmail,
  getRenewalEmail,
  getWithdrawalEmail,
  getWelcomeEmail,
  getAdminReviewNotificationEmail,
} from "@/lib/email/templates";

describe("Email Templates", () => {
  describe("getPaymentSuccessEmail", () => {
    it("returns subject, text, and html", () => {
      const result = getPaymentSuccessEmail({
        cohortName: "Web3 Bootcamp",
        amount: 50000,
        currency: "NGN",
      });

      expect(result.subject).toBe("Payment Confirmed: Web3 Bootcamp");
      expect(result.text).toContain("Web3 Bootcamp");
      expect(result.text).toContain("NGN 50000");
      expect(result.html).toContain("Payment confirmed");
      expect(result.html).toContain("Web3 Bootcamp");
    });

    it("includes receipt URL when provided", () => {
      const result = getPaymentSuccessEmail({
        cohortName: "Test",
        amount: 100,
        currency: "USD",
        receiptUrl: "https://example.com/receipt",
      });

      expect(result.html).toContain("https://example.com/receipt");
      expect(result.html).toContain("View receipt");
    });
  });

  describe("getRenewalEmail", () => {
    it("returns correct content for 30-day renewal", () => {
      const result = getRenewalEmail({ durationDays: 30 });

      expect(result.subject).toBe("Subscription Renewed");
      expect(result.text).toContain("30 days");
    });
  });

  describe("getWithdrawalEmail", () => {
    it("includes transaction hash when provided", () => {
      const result = getWithdrawalEmail({
        amount: 100,
        txHash: "0x123abc",
        chainId: 8453,
      });

      expect(result.html).toContain("0x123abc");
      expect(result.html).toContain("basescan.org");
    });
  });

  describe("getWelcomeEmail", () => {
    it("personalizes with display name", () => {
      const result = getWelcomeEmail({ displayName: "John" });

      expect(result.text).toContain("Hi John");
      expect(result.html).toContain("Hi John");
    });
  });

  describe("getAdminReviewNotificationEmail", () => {
    const testParams = {
      taskTitle: "Deploy Smart Contract",
      userName: "Alice Smith",
      submissionType: "url",
      reviewUrl: "http://localhost:3000/admin/cohorts/tasks/123/submissions",
    };

    it("returns subject, text, and html", () => {
      const result = getAdminReviewNotificationEmail(testParams);

      expect(result.subject).toBe(
        "New Submission Requires Review: Deploy Smart Contract",
      );
      expect(result.text).toContain("Deploy Smart Contract");
      expect(result.text).toContain("Alice Smith");
      expect(result.text).toContain("url");
      expect(result.html).toContain("New Submission Requires Review");
      expect(result.html).toContain("Deploy Smart Contract");
    });

    it("includes all required information in HTML", () => {
      const result = getAdminReviewNotificationEmail(testParams);

      expect(result.html).toContain("Deploy Smart Contract");
      expect(result.html).toContain("Alice Smith");
      expect(result.html).toContain("url");
      expect(result.html).toContain(
        "http://localhost:3000/admin/cohorts/tasks/123/submissions",
      );
      expect(result.html).toContain("Review Submission");
    });

    it("includes review URL in both text and html", () => {
      const result = getAdminReviewNotificationEmail(testParams);

      expect(result.text).toContain(
        "http://localhost:3000/admin/cohorts/tasks/123/submissions",
      );
      expect(result.html).toContain(
        "http://localhost:3000/admin/cohorts/tasks/123/submissions",
      );
    });

    it("handles different submission types", () => {
      const contractParams = {
        ...testParams,
        submissionType: "contract_interaction",
      };
      const result = getAdminReviewNotificationEmail(contractParams);

      expect(result.text).toContain("contract_interaction");
      expect(result.html).toContain("contract_interaction");
    });

    it("includes task title in subject line", () => {
      const params = {
        ...testParams,
        taskTitle: "Complete KYC Verification",
      };
      const result = getAdminReviewNotificationEmail(params);

      expect(result.subject).toBe(
        "New Submission Requires Review: Complete KYC Verification",
      );
    });
  });
});
