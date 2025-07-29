import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import {
  unlockUtils,
  getTotalKeys,
  checkKeyOwnership,
  getUserKeyBalance,
  getKeyPrice,
  purchaseKey,
  getBlockExplorerUrl,
  type PurchaseResult,
} from "../lib/unlock/lockUtils";

// Mock ethers with proper constructor mocking
const mockContract = {
  totalSupply: jest.fn(),
  getHasValidKey: jest.fn(),
  balanceOf: jest.fn(),
  keyPrice: jest.fn(),
  purchase: jest.fn(),
};

const mockProvider = {
  call: jest.fn(),
};

const mockSigner = {
  address: "0x0987654321098765432109876543210987654321",
};

const mockEthersProvider = {
  getSigner: jest.fn().mockResolvedValue(mockSigner),
};

const mockRawProvider = {
  request: jest.fn(),
};

jest.mock("ethers", () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => mockProvider),
    Contract: jest.fn().mockImplementation(() => mockContract),
    BrowserProvider: jest.fn().mockImplementation(() => mockEthersProvider),
    isAddress: jest.fn().mockImplementation((address: string) => {
      return address.startsWith("0x") && address.length === 42;
    }),
  },
  parseEther: jest.fn().mockImplementation((value: string) => {
    return BigInt(parseFloat(value) * 1e18);
  }),
  formatEther: jest.fn().mockImplementation((value: bigint) => {
    return (Number(value) / 1e18).toString();
  }),
}));

// Mock the blockchain config
jest.mock("../lib/blockchain/config", () => ({
  CHAIN_CONFIG: {
    chain: {
      id: 84532, // Base Sepolia
      name: "Base Sepolia",
      nativeCurrency: {
        name: "Ethereum",
        symbol: "ETH",
        decimals: 18,
      },
      blockExplorers: {
        default: {
          url: "https://sepolia.basescan.org",
        },
      },
    },
    rpcUrl: "https://sepolia.base.org",
  },
}));

// Mock constants
jest.mock("../constants", () => ({
  PUBLIC_LOCK_CONTRACT: {
    abi: [
      {
        inputs: [
          { internalType: "address", name: "_keyOwner", type: "address" },
        ],
        name: "getHasValidKey",
        outputs: [{ internalType: "bool", name: "isValid", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "totalSupply",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [{ internalType: "address", name: "owner", type: "address" }],
        name: "balanceOf",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "keyPrice",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
  },
}));

describe("UnlockUtils", () => {
  const mockLockAddress = "0x1234567890123456789012345678901234567890";
  const mockUserAddress = "0x0987654321098765432109876543210987654321";

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockContract.totalSupply.mockReset();
    mockContract.getHasValidKey.mockReset();
    mockContract.balanceOf.mockReset();
    mockContract.keyPrice.mockReset();
    mockContract.purchase.mockReset();

    // Setup default mock behavior for rawProvider
    mockRawProvider.request.mockImplementation((request: any) => {
      if (request.method === "eth_chainId") {
        return Promise.resolve("0x14a34"); // Base Sepolia hex
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("unlockUtils export", () => {
    it("should export all expected functions", () => {
      expect(unlockUtils.getTotalKeys).toBeDefined();
      expect(unlockUtils.checkKeyOwnership).toBeDefined();
      expect(unlockUtils.getUserKeyBalance).toBeDefined();
      expect(unlockUtils.getKeyPrice).toBeDefined();
      expect(unlockUtils.purchaseKey).toBeDefined();
      expect(unlockUtils.getBlockExplorerUrl).toBeDefined();
    });
  });

  describe("getBlockExplorerUrl", () => {
    it("should return correct block explorer URL for Base Sepolia", () => {
      const txHash = "0xabcdef123456789";
      const expectedUrl = "https://sepolia.basescan.org/tx/0xabcdef123456789";

      expect(getBlockExplorerUrl(txHash)).toBe(expectedUrl);
    });
  });

  describe("getTotalKeys", () => {
    it("should return total keys for valid lock address", async () => {
      const expectedTotal = 42;
      mockContract.totalSupply.mockResolvedValue(BigInt(expectedTotal));

      const result = await getTotalKeys(mockLockAddress);

      expect(result).toBe(expectedTotal);
      expect(mockContract.totalSupply).toHaveBeenCalled();
    });

    it("should return 0 for invalid lock address", async () => {
      const result = await getTotalKeys("invalid");
      expect(result).toBe(0);
    });

    it('should return 0 for "Unknown" lock address', async () => {
      const result = await getTotalKeys("Unknown");
      expect(result).toBe(0);
    });

    it("should handle contract errors gracefully", async () => {
      mockContract.totalSupply.mockRejectedValue(new Error("Contract error"));

      const result = await getTotalKeys(mockLockAddress);
      expect(result).toBe(0);
    });
  });

  describe("checkKeyOwnership", () => {
    it("should return true when user has valid key", async () => {
      mockContract.getHasValidKey.mockResolvedValue(true);

      const result = await checkKeyOwnership(mockLockAddress, mockUserAddress);

      expect(result).toBe(true);
      expect(mockContract.getHasValidKey).toHaveBeenCalledWith(mockUserAddress);
    });

    it("should return false when user has no valid key", async () => {
      mockContract.getHasValidKey.mockResolvedValue(false);

      const result = await checkKeyOwnership(mockLockAddress, mockUserAddress);

      expect(result).toBe(false);
    });

    it("should return false for invalid addresses", async () => {
      const result1 = await checkKeyOwnership("invalid", mockUserAddress);
      const result2 = await checkKeyOwnership(mockLockAddress, "invalid");

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it("should handle contract errors gracefully", async () => {
      mockContract.getHasValidKey.mockRejectedValue(
        new Error("Contract error")
      );

      const result = await checkKeyOwnership(mockLockAddress, mockUserAddress);
      expect(result).toBe(false);
    });
  });

  describe("getUserKeyBalance", () => {
    it("should return user key balance", async () => {
      const expectedBalance = 3;
      mockContract.balanceOf.mockResolvedValue(BigInt(expectedBalance));

      const result = await getUserKeyBalance(mockLockAddress, mockUserAddress);

      expect(result).toBe(expectedBalance);
      expect(mockContract.balanceOf).toHaveBeenCalledWith(mockUserAddress);
    });

    it("should return 0 for invalid addresses", async () => {
      const result1 = await getUserKeyBalance("invalid", mockUserAddress);
      const result2 = await getUserKeyBalance(mockLockAddress, "invalid");

      expect(result1).toBe(0);
      expect(result2).toBe(0);
    });

    it("should handle contract errors gracefully", async () => {
      mockContract.balanceOf.mockRejectedValue(new Error("Contract error"));

      const result = await getUserKeyBalance(mockLockAddress, mockUserAddress);
      expect(result).toBe(0);
    });
  });

  describe("getKeyPrice", () => {
    it("should return key price in wei and ETH", async () => {
      const priceInWei = "1000000000000000000"; // 1 ETH in wei
      mockContract.keyPrice.mockResolvedValue(BigInt(priceInWei));

      const result = await getKeyPrice(mockLockAddress);

      expect(result.price).toBe(BigInt(priceInWei));
      expect(mockContract.keyPrice).toHaveBeenCalled();
    });

    it("should return zero price for invalid address", async () => {
      const result = await getKeyPrice("invalid");

      expect(result.price).toBe(0n);
      expect(result.priceInEth).toBe("0");
    });

    it("should handle contract errors gracefully", async () => {
      mockContract.keyPrice.mockRejectedValue(new Error("Contract error"));

      const result = await getKeyPrice(mockLockAddress);
      expect(result.price).toBe(0n);
      expect(result.priceInEth).toBe("0");
    });
  });

  describe("purchaseKey", () => {
    let mockWallet: any;

    beforeEach(() => {
      mockWallet = {
        address: mockUserAddress,
        getEthereumProvider: jest.fn().mockResolvedValue(mockRawProvider),
      };
    });

    it("should successfully purchase a key", async () => {
      const price = 0.1;
      const currency = "ETH";
      const mockTxHash = "0xabcdef123456789";

      // Mock contract interactions
      mockContract.keyPrice.mockResolvedValue(BigInt("100000000000000000")); // 0.1 ETH in wei
      mockContract.purchase.mockResolvedValue({
        hash: mockTxHash,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      });

      const result = await purchaseKey(
        mockLockAddress,
        price,
        currency,
        mockWallet
      );

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe(mockTxHash);
    });

    it("should handle FREE currency", async () => {
      const price = 0;
      const currency = "FREE";
      const mockTxHash = "0xabcdef123456789";

      mockContract.keyPrice.mockResolvedValue(0n);
      mockContract.purchase.mockResolvedValue({
        hash: mockTxHash,
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      });

      const result = await purchaseKey(
        mockLockAddress,
        price,
        currency,
        mockWallet
      );

      expect(result.success).toBe(true);
    });

    it("should fail for invalid lock address", async () => {
      const result = await purchaseKey("invalid", 0.1, "ETH", mockWallet);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid lock address");
    });

    it("should fail when wallet is not provided", async () => {
      const result = await purchaseKey(mockLockAddress, 0.1, "ETH", null);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No wallet provided");
    });

    it("should fail when on-chain price differs from expected", async () => {
      const price = 0.1;
      const currency = "ETH";

      // Mock different price on-chain
      mockContract.keyPrice.mockResolvedValue(BigInt("200000000000000000")); // 0.2 ETH in wei

      const result = await purchaseKey(
        mockLockAddress,
        price,
        currency,
        mockWallet
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("The key price has changed");
    });

    it("should handle transaction rejection", async () => {
      const price = 0.1;
      const currency = "ETH";

      mockContract.keyPrice.mockResolvedValue(BigInt("100000000000000000"));
      mockContract.purchase.mockRejectedValue(new Error("User rejected"));

      const result = await purchaseKey(
        mockLockAddress,
        price,
        currency,
        mockWallet
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Transaction was cancelled");
    });

    it("should handle insufficient funds error", async () => {
      const price = 0.1;
      const currency = "ETH";

      mockContract.keyPrice.mockResolvedValue(BigInt("100000000000000000"));
      mockContract.purchase.mockRejectedValue(new Error("insufficient funds"));

      const result = await purchaseKey(
        mockLockAddress,
        price,
        currency,
        mockWallet
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient funds");
    });
  });
});
