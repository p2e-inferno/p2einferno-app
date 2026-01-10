import { claimEmailSend } from "@/lib/email/dedup";

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

describe("Email Deduplication", () => {
  it("claimEmailSend returns true when no prior record exists", async () => {
    const result = await claimEmailSend(
      "payment-success",
      "uuid-123",
      "test@example.com",
      "payment:test@example.com",
    );
    expect(result).toBe(true);
  });
});
