import {
  getPaymentSuccessEmail,
  getRenewalEmail,
  getWithdrawalEmail,
  getWelcomeEmail,
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
});
