import {
  generateTempAttestationId,
  formatAttestationError,
  isAttestationExpired,
  getTimeUntilExpiration,
  formatAttestationDataForDisplay,
  getAttestationCategoryColor,
  truncateAttestationUid,
  parseSchemaDefinition,
} from "@/lib/attestation/utils/helpers";

describe("attestation helper utils", () => {
  describe("generateTempAttestationId", () => {
    test("generates unique temporary IDs", () => {
      const id1 = generateTempAttestationId();
      const id2 = generateTempAttestationId();

      expect(id1).toMatch(/^temp_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^temp_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("formatAttestationError", () => {
    test("formats user rejection errors", () => {
      const error = new Error("User rejected transaction");
      expect(formatAttestationError(error)).toBe(
        "Transaction was cancelled by user",
      );
    });

    test("formats insufficient funds errors", () => {
      const error = new Error("insufficient funds for gas");
      expect(formatAttestationError(error)).toBe(
        "Insufficient funds to complete the transaction",
      );
    });

    test("formats network errors", () => {
      const error = new Error("network connection failed");
      expect(formatAttestationError(error)).toBe(
        "Network error. Please check your connection and try again",
      );
    });

    test("formats generic errors", () => {
      const error = new Error("Something went wrong");
      expect(formatAttestationError(error)).toBe("Something went wrong");
    });

    test("handles non-Error objects", () => {
      expect(formatAttestationError("string error")).toBe(
        "An unknown error occurred",
      );
      expect(formatAttestationError(null)).toBe("An unknown error occurred");
      expect(formatAttestationError(undefined)).toBe(
        "An unknown error occurred",
      );
    });
  });

  describe("isAttestationExpired", () => {
    test("returns false for undefined expiration", () => {
      expect(isAttestationExpired(undefined)).toBe(false);
      expect(isAttestationExpired("")).toBe(false);
    });

    test("returns true for past expiration", () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      expect(isAttestationExpired(pastDate.toISOString())).toBe(true);
    });

    test("returns false for future expiration", () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      expect(isAttestationExpired(futureDate.toISOString())).toBe(false);
    });
  });

  describe("getTimeUntilExpiration", () => {
    test("returns null for undefined expiration", () => {
      expect(getTimeUntilExpiration(undefined)).toBeNull();
      expect(getTimeUntilExpiration("")).toBeNull();
    });

    test('returns "Expired" for past expiration', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60);
      expect(getTimeUntilExpiration(pastDate.toISOString())).toBe("Expired");
    });

    test("returns days for long durations", () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days
      expect(getTimeUntilExpiration(futureDate.toISOString())).toBe(
        "3 days remaining",
      );
    });

    test("returns hours for medium durations", () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 2); // 2 hours
      expect(getTimeUntilExpiration(futureDate.toISOString())).toBe(
        "2 hours remaining",
      );
    });

    test("returns minutes for short durations", () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
      expect(getTimeUntilExpiration(futureDate.toISOString())).toBe(
        "30 minutes remaining",
      );
    });

    test("handles singular vs plural correctly", () => {
      const oneDayDate = new Date(Date.now() + 1000 * 60 * 60 * 24 + 1000); // Add 1 second buffer
      const oneHourDate = new Date(Date.now() + 1000 * 60 * 60 + 1000); // Add 1 second buffer
      const oneMinuteDate = new Date(Date.now() + 1000 * 60 + 1000); // Add 1 second buffer

      expect(getTimeUntilExpiration(oneDayDate.toISOString())).toBe(
        "1 day remaining",
      );
      expect(getTimeUntilExpiration(oneHourDate.toISOString())).toBe(
        "1 hour remaining",
      );
      expect(getTimeUntilExpiration(oneMinuteDate.toISOString())).toBe(
        "1 minute remaining",
      );
    });
  });

  describe("formatAttestationDataForDisplay", () => {
    test("formats various data types correctly", () => {
      const data = {
        address: "0x123",
        amount: 100,
        active: true,
        inactive: false,
        bigNumber: BigInt(123456789),
        nullValue: null,
        undefinedValue: undefined,
        stringValue: "test",
      };

      const result = formatAttestationDataForDisplay(data);

      expect(result).toEqual({
        address: "0x123",
        amount: "100",
        active: "Yes",
        inactive: "No",
        bigNumber: "123456789",
        nullValue: "N/A",
        undefinedValue: "N/A",
        stringValue: "test",
      });
    });
  });

  describe("getAttestationCategoryColor", () => {
    test("returns correct colors for known categories", () => {
      expect(getAttestationCategoryColor("attendance")).toBe(
        "text-green-600 bg-green-100",
      );
      expect(getAttestationCategoryColor("social")).toBe(
        "text-blue-600 bg-blue-100",
      );
      expect(getAttestationCategoryColor("verification")).toBe(
        "text-purple-600 bg-purple-100",
      );
      expect(getAttestationCategoryColor("review")).toBe(
        "text-orange-600 bg-orange-100",
      );
      expect(getAttestationCategoryColor("achievement")).toBe(
        "text-yellow-600 bg-yellow-100",
      );
    });

    test("returns default color for unknown categories", () => {
      expect(getAttestationCategoryColor("unknown")).toBe(
        "text-gray-600 bg-gray-100",
      );
      expect(getAttestationCategoryColor("")).toBe("text-gray-600 bg-gray-100");
    });
  });

  describe("truncateAttestationUid", () => {
    test("truncates long UIDs correctly", () => {
      const longUid = "0x1234567890abcdef1234567890abcdef12345678";
      expect(truncateAttestationUid(longUid)).toBe("0x1234...5678");
    });

    test("returns short UIDs unchanged", () => {
      const shortUid = "0x123456";
      expect(truncateAttestationUid(shortUid)).toBe("0x123456");
    });

    test("handles custom truncation lengths", () => {
      const uid = "0x1234567890abcdef1234567890abcdef12345678";
      expect(truncateAttestationUid(uid, 8, 6)).toBe("0x123456...345678");
    });
  });

  describe("parseSchemaDefinition", () => {
    test("parses valid schema definition", () => {
      const schema = "address user,string name,uint256 amount";
      const result = parseSchemaDefinition(schema);

      expect(result).toEqual([
        { type: "address", name: "user" },
        { type: "string", name: "name" },
        { type: "uint256", name: "amount" },
      ]);
    });

    test("handles schema with extra whitespace", () => {
      const schema = " address  user , string  name ";
      const result = parseSchemaDefinition(schema);

      expect(result).toEqual([
        { type: "address", name: "user" },
        { type: "string", name: "name" },
      ]);
    });

    test("handles empty schema", () => {
      expect(parseSchemaDefinition("")).toEqual([]);
    });
  });
});
