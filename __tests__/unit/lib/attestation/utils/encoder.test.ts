import {
  encodeAttestationData,
  decodeAttestationData,
} from "@/lib/attestation/utils/encoder";

// Note: ethers is already mocked in __mocks__/ethers.js

describe("attestation encoder utils", () => {
  describe("encodeAttestationData", () => {
    test("encodes simple schema with provided data", () => {
      const schema = "address walletAddress,string greeting,uint256 timestamp";
      const data = {
        walletAddress: "0x1234567890123456789012345678901234567890",
        greeting: "GM",
        timestamp: 1234567890,
      };

      const result = encodeAttestationData(schema, data);

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      // The result should be a string starting with 0x (mock implementation)
      expect(result).toMatch(/^0x/);
    });

    test("provides defaults for missing data fields", () => {
      const schema = "address walletAddress,string greeting,uint256 timestamp";
      const data = {
        greeting: "GM",
        // missing walletAddress and timestamp
      };

      const result = encodeAttestationData(schema, data);

      expect(result).toBeDefined();
      expect(result).toMatch(/^0x/);
    });

    test("handles empty data object", () => {
      const schema = "address walletAddress,string greeting";
      const data = {};

      const result = encodeAttestationData(schema, data);

      expect(result).toBeDefined();
      expect(result).toMatch(/^0x/);
    });

    test("throws error for invalid schema format", () => {
      const schema = "invalid schema format";
      const data = {};

      expect(() => encodeAttestationData(schema, data)).toThrow(
        /Failed to encode attestation data/,
      );
    });

    test("handles complex schema with multiple types", () => {
      const schema = "address user,string title,uint256 amount,bool active";
      const data = {
        user: "0xabc",
        title: "Test",
        amount: 100,
        active: true,
      };

      const result = encodeAttestationData(schema, data);

      expect(result).toBeDefined();
      expect(result).toMatch(/^0x/);
    });
  });

  describe("decodeAttestationData", () => {
    test("decodes attestation data correctly", () => {
      const schema = "address walletAddress,string greeting,uint256 timestamp";
      const encodedData = "0xmockencodeddata";

      const result = decodeAttestationData(schema, encodedData);

      // Check that we get an object with the expected keys
      expect(result).toHaveProperty("walletAddress");
      expect(result).toHaveProperty("greeting");
      expect(result).toHaveProperty("timestamp");
    });

    test("throws error for invalid schema in decode", () => {
      const schema = "invalid";
      const encodedData = "0xdata";

      expect(() => decodeAttestationData(schema, encodedData)).toThrow(
        /Failed to decode attestation data/,
      );
    });

    test("handles decoding errors gracefully", () => {
      // Test the existing error handling in the function
      const schema = "address user,string name";
      const encodedData = "invalid-data-format";

      expect(() => decodeAttestationData(schema, encodedData)).toThrow(
        /Failed to decode attestation data/,
      );
    });
  });
});
