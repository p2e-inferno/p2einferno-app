import {
  verifyMaxKeysSecurity,
  getLockConfigForUpdate,
} from "@/lib/blockchain/helpers/max-keys-security";
import type { PublicClient, Address } from "viem";

describe("max-keys-security", () => {
  const mockLockAddress = "0x1234567890abcdef1234567890abcdef12345678" as Address;

  // Helper to create stub public client
  function createStubClient(config: {
    maxKeysPerAddress?: bigint;
    expirationDuration?: bigint;
    maxNumberOfKeys?: bigint;
    networkError?: boolean;
    contractNotFound?: boolean;
    throwOnInvalidAddress?: boolean;
  }) {
    return {
      readContract: jest.fn((args: any) => {
        if (config.networkError) {
          return Promise.reject(new Error("Network error"));
        }
        if (config.contractNotFound) {
          return Promise.reject(new Error("Contract not found"));
        }
        if (config.throwOnInvalidAddress && args.address === "invalid") {
          return Promise.reject(new Error("Invalid address format"));
        }

        switch (args.functionName) {
          case "maxKeysPerAddress":
            return Promise.resolve(config.maxKeysPerAddress ?? 0n);
          case "expirationDuration":
            return Promise.resolve(config.expirationDuration ?? 0n);
          case "maxNumberOfKeys":
            return Promise.resolve(config.maxNumberOfKeys ?? 0n);
          default:
            return Promise.reject(new Error("Unknown function"));
        }
      }),
    } as unknown as PublicClient;
  }

  describe("verifyMaxKeysSecurity", () => {
    it("returns isSecure:true when maxKeysPerAddress is 0", async () => {
      const mockClient = createStubClient({ maxKeysPerAddress: 0n });
      const result = await verifyMaxKeysSecurity(mockLockAddress, mockClient);
      expect(result).toEqual({ isSecure: true, currentValue: 0n });
    });

    it("returns isSecure:false when maxKeysPerAddress is 1", async () => {
      const mockClient = createStubClient({ maxKeysPerAddress: 1n });
      const result = await verifyMaxKeysSecurity(mockLockAddress, mockClient);
      expect(result).toEqual({ isSecure: false, currentValue: 1n });
    });

    it("returns isSecure:false for high maxKeysPerAddress values", async () => {
      const mockClient = createStubClient({ maxKeysPerAddress: 100n });
      const result = await verifyMaxKeysSecurity(mockLockAddress, mockClient);
      expect(result).toEqual({ isSecure: false, currentValue: 100n });
    });

    it("throws error for invalid lock address format", async () => {
      const mockClient = createStubClient({ throwOnInvalidAddress: true });
      await expect(
        verifyMaxKeysSecurity("invalid" as Address, mockClient),
      ).rejects.toThrow("Invalid address format");
    });

    it("throws error when network is unavailable", async () => {
      const mockClient = createStubClient({ networkError: true });
      await expect(
        verifyMaxKeysSecurity(mockLockAddress, mockClient),
      ).rejects.toThrow("Network error");
    });

    it("throws error when lock address is not a contract", async () => {
      const mockClient = createStubClient({ contractNotFound: true });
      await expect(
        verifyMaxKeysSecurity(mockLockAddress, mockClient),
      ).rejects.toThrow("Contract not found");
    });
  });

  describe("getLockConfigForUpdate", () => {
    it("returns current config with maxKeysPerAddress forced to 0", async () => {
      const mockClient = createStubClient({
        expirationDuration: 31536000n,
        maxNumberOfKeys: 1000n,
      });
      const result = await getLockConfigForUpdate(mockLockAddress, mockClient);
      expect(result).toEqual([31536000n, 1000n, 0n]);
    });

    it("preserves zero expirationDuration", async () => {
      const mockClient = createStubClient({
        expirationDuration: 0n,
        maxNumberOfKeys: 100n,
      });
      const result = await getLockConfigForUpdate(mockLockAddress, mockClient);
      expect(result).toEqual([0n, 100n, 0n]);
    });

    it("preserves zero maxNumberOfKeys", async () => {
      const mockClient = createStubClient({
        expirationDuration: 1000n,
        maxNumberOfKeys: 0n,
      });
      const result = await getLockConfigForUpdate(mockLockAddress, mockClient);
      expect(result).toEqual([1000n, 0n, 0n]);
    });

    it("preserves large config values", async () => {
      const mockClient = createStubClient({
        expirationDuration: 999999999n,
        maxNumberOfKeys: 999999999n,
      });
      const result = await getLockConfigForUpdate(mockLockAddress, mockClient);
      expect(result).toEqual([999999999n, 999999999n, 0n]);
    });

    it("throws on invalid lock address", async () => {
      const mockClient = createStubClient({ throwOnInvalidAddress: true });
      await expect(
        getLockConfigForUpdate("invalid" as Address, mockClient),
      ).rejects.toThrow("Invalid address format");
    });

    it("throws on network error during read", async () => {
      const mockClient = createStubClient({ networkError: true });
      await expect(
        getLockConfigForUpdate(mockLockAddress, mockClient),
      ).rejects.toThrow("Network error");
    });

    it("throws when contract not found", async () => {
      const mockClient = createStubClient({ contractNotFound: true });
      await expect(
        getLockConfigForUpdate(mockLockAddress, mockClient),
      ).rejects.toThrow("Contract not found");
    });

    it("calls both expirationDuration and maxNumberOfKeys", async () => {
      const mockClient = createStubClient({
        expirationDuration: 1000n,
        maxNumberOfKeys: 100n,
      });
      await getLockConfigForUpdate(mockLockAddress, mockClient);

      expect(mockClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "expirationDuration" }),
      );
      expect(mockClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "maxNumberOfKeys" }),
      );
    });
  });
});
