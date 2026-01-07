import { normalizeEmail } from "@/lib/email/mailgun";

describe("normalizeEmail", () => {
  it("returns null for empty values", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("lowercases and trims valid emails", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("returns null for invalid emails", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("missing@domain")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
  });
});
