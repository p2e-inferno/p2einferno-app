import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

// Validate environment variables
const validateEnvironment = () => {
  if (!process.env.LOCK_MANAGER_PRIVATE_KEY) {
    throw new Error(
      "LOCK_MANAGER_PRIVATE_KEY is not set in environment variables"
    );
  }

  // Ensure private key is properly formatted
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  if (!privateKey.startsWith("0x")) {
    throw new Error("LOCK_MANAGER_PRIVATE_KEY must start with 0x");
  }

  if (privateKey.length !== 66) {
    throw new Error(
      "LOCK_MANAGER_PRIVATE_KEY must be 64 characters long (excluding 0x prefix)"
    );
  }

  return privateKey as `0x${string}`;
};

// ---------------------------------------------------------------------------
// Chain configuration
// ---------------------------------------------------------------------------
// Default to Base Sepolia (test-net) to avoid accidental main-net transactions
// and the “grantKeys returned no data (0x)” error that occurs when the contract
// isn’t deployed on Base main-net. You can override the network by setting the
// environment variable BLOCKCHAIN_NETWORK to "base" (main-net) or
// "base-sepolia".

const resolveChain = () => {
  const network = (
    process.env.BLOCKCHAIN_NETWORK || "base-sepolia"
  ).toLowerCase();
  switch (network) {
    case "base":
    case "mainnet":
      return { chain: base, defaultRpc: "https://mainnet.base.org" } as const;
    case "base-sepolia":
    default:
      return {
        chain: baseSepolia,
        defaultRpc: "https://sepolia.base.org",
      } as const;
  }
};

const { chain, defaultRpc } = resolveChain();

export const CHAIN_CONFIG = {
  chain,
  rpcUrl: process.env.BASE_RPC_URL || defaultRpc,
};

// Create account from private key
const createLockManagerAccount = (): Account => {
  try {
    const privateKey = validateEnvironment();
    return privateKeyToAccount(privateKey);
  } catch (error) {
    console.error("Failed to create lock manager account:", error);
    throw error;
  }
};

// Create public client for reading from blockchain
export const createBlockchainPublicClient = () => {
  return createPublicClient({
    chain: CHAIN_CONFIG.chain,
    transport: http(CHAIN_CONFIG.rpcUrl),
  }) as PublicClient;
};

// Create wallet client for writing to blockchain
export const createBlockchainWalletClient = () => {
  const account = createLockManagerAccount();

  return createWalletClient({
    account,
    chain: CHAIN_CONFIG.chain,
    transport: http(CHAIN_CONFIG.rpcUrl),
  }) as WalletClient;
};

// Export chain ID for reference
export const CHAIN_ID = CHAIN_CONFIG.chain.id;
