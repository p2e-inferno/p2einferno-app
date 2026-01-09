import {
  normalizeSchemaKey,
  isValidSchemaKey,
} from "@/lib/attestation/schemas/schema-key-utils";

describe("schema-key-utils", () => {
  it("normalizes keys to snake_case and strips invalid chars", () => {
    expect(normalizeSchemaKey(" Daily Check-in ")).toBe("daily_check_in");
    expect(normalizeSchemaKey("Quest  Completion!!")).toBe("quest_completion");
    expect(normalizeSchemaKey("BOOTCAMP__Completion")).toBe(
      "bootcamp_completion",
    );
  });

  it("validates normalized keys", () => {
    expect(isValidSchemaKey("daily_checkin")).toBe(true);
    expect(isValidSchemaKey("daily-checkin")).toBe(false);
    expect(isValidSchemaKey("daily checkin")).toBe(false);
  });
});
