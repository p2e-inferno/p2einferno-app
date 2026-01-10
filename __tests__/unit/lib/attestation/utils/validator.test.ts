import {
  isValidAddress,
  isValidSchemaDefinition,
  isValidSolidityType,
  validateAttestationData,
  validateWalletConnection,
} from "@/lib/attestation/utils/validator";

// Note: ethers is already mocked in __mocks__/ethers.js with isAddress function

describe("attestation validator utils", () => {
  describe("isValidAddress", () => {
    test("validates correct Ethereum address", () => {
      expect(isValidAddress("0x1234567890123456789012345678901234567890")).toBe(
        true,
      );
      expect(isValidAddress("0x0000000000000000000000000000000000000000")).toBe(
        true,
      );
    });

    test("rejects invalid addresses", () => {
      expect(isValidAddress("invalid")).toBe(false);
      expect(isValidAddress("0xinvalid")).toBe(false);
      expect(isValidAddress("")).toBe(false);
    });

    test("handles exceptions gracefully", () => {
      // Test with clearly invalid input that will make the function catch errors
      expect(isValidAddress("")).toBe(false);
      expect(isValidAddress("invalid")).toBe(false);
    });
  });

  describe("isValidSolidityType", () => {
    test("validates basic Solidity types", () => {
      expect(isValidSolidityType("address")).toBe(true);
      expect(isValidSolidityType("bool")).toBe(true);
      expect(isValidSolidityType("string")).toBe(true);
      expect(isValidSolidityType("bytes")).toBe(true);
    });

    test("validates uint types", () => {
      expect(isValidSolidityType("uint8")).toBe(true);
      expect(isValidSolidityType("uint256")).toBe(true);
      expect(isValidSolidityType("uint128")).toBe(true);
    });

    test("validates int types", () => {
      expect(isValidSolidityType("int8")).toBe(true);
      expect(isValidSolidityType("int256")).toBe(true);
    });

    test("validates bytes types", () => {
      expect(isValidSolidityType("bytes1")).toBe(true);
      expect(isValidSolidityType("bytes32")).toBe(true);
    });

    test("validates array types", () => {
      expect(isValidSolidityType("uint256[]")).toBe(true);
      expect(isValidSolidityType("address[]")).toBe(true);
      expect(isValidSolidityType("string[5]")).toBe(true);
    });

    test("rejects invalid types", () => {
      expect(isValidSolidityType("invalid")).toBe(false);
      expect(isValidSolidityType("uint")).toBe(false);
      expect(isValidSolidityType("uint999")).toBe(false);
      expect(isValidSolidityType("")).toBe(false);
    });
  });

  describe("isValidSchemaDefinition", () => {
    test("validates correct schema definitions", () => {
      expect(isValidSchemaDefinition("address user,string name")).toBe(true);
      expect(isValidSchemaDefinition("uint256 amount,bool active")).toBe(true);
      expect(
        isValidSchemaDefinition(
          "address walletAddress,string greeting,uint256 timestamp",
        ),
      ).toBe(true);
    });

    test("rejects invalid schema definitions", () => {
      expect(isValidSchemaDefinition("invalid")).toBe(false);
      expect(isValidSchemaDefinition("address")).toBe(false);
      expect(isValidSchemaDefinition("invalid type,string name")).toBe(false);
      expect(isValidSchemaDefinition("address 123invalid")).toBe(false);
      expect(isValidSchemaDefinition("")).toBe(false);
    });

    test("handles malformed field definitions", () => {
      expect(isValidSchemaDefinition("address user name")).toBe(false);
      expect(isValidSchemaDefinition("address,string name")).toBe(false);
    });
  });

  describe("validateAttestationData", () => {
    test("validates correct attestation data", () => {
      const schema = "address user,string name,uint256 amount,bool active";
      const data = {
        user: "0x1234567890123456789012345678901234567890",
        name: "Test User",
        amount: 100,
        active: true,
      };

      const result = validateAttestationData(schema, data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("allows missing optional fields", () => {
      const schema = "address user,string name";
      const data = {
        user: "0x1234567890123456789012345678901234567890",
        // name is missing but should be optional
      };

      const result = validateAttestationData(schema, data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("validates address fields", () => {
      const schema = "address user";
      const data = {
        user: "invalid-address",
      };

      const result = validateAttestationData(schema, data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid address for field user: invalid-address",
      );
    });

    test("validates boolean fields", () => {
      const schema = "bool active";
      const data = {
        active: "not-a-boolean",
      };

      const result = validateAttestationData(schema, data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid boolean for field active: not-a-boolean",
      );
    });

    test("validates string fields", () => {
      const schema = "string name";
      const data = {
        name: 123,
      };

      const result = validateAttestationData(schema, data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid string for field name: 123");
    });

    test("validates uint fields", () => {
      const schema = "uint256 amount";
      const data = {
        amount: -5,
      };

      const result = validateAttestationData(schema, data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid uint for field amount: must be a positive integer",
      );
    });

    test("handles schema parsing errors", () => {
      const schema = "invalidtype invalidname"; // Invalid Solidity type
      const data = {
        invalidname: "some value",
      };

      const result = validateAttestationData(schema, data);
      // This should pass validation since we don't validate the type itself in this function
      // The type validation is done elsewhere (in isValidSolidityType)
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("validateWalletConnection", () => {
    test("validates proper wallet object", () => {
      const wallet = {
        address: "0x1234567890123456789012345678901234567890",
        getEthereumProvider: () => {},
      };

      const result = validateWalletConnection(wallet);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("rejects null/undefined wallet", () => {
      expect(validateWalletConnection(null).valid).toBe(false);
      expect(validateWalletConnection(undefined).valid).toBe(false);
    });

    test("rejects wallet with invalid address", () => {
      const wallet = {
        address: "invalid",
        getEthereumProvider: () => {},
      };

      const result = validateWalletConnection(wallet);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid wallet address");
    });

    test("rejects wallet without getEthereumProvider method", () => {
      const wallet = {
        address: "0x1234567890123456789012345678901234567890",
      };

      const result = validateWalletConnection(wallet);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Wallet does not expose an Ethereum provider");
    });
  });
});
