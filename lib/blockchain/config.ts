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

// Validate environment variables - now with optional private key
const validateEnvironment = () => {
  // Private key is now optional since we're only using read operations
  if (!process.env.LOCK_MANAGER_PRIVATE_KEY) {
    console.warn(
      "LOCK_MANAGER_PRIVATE_KEY not set - write operations will be disabled"
    );
  }

  // Only validate the private key if it's provided
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  if (privateKey && !privateKey.startsWith("0x")) {
    throw new Error("LOCK_MANAGER_PRIVATE_KEY must start with 0x");
  }

  if (privateKey && privateKey.length !== 66) {
    throw new Error(
      "LOCK_MANAGER_PRIVATE_KEY must be 64 characters long (excluding 0x prefix)"
    );
  }

  // Validate USDC token addresses
  if (!process.env.USDC_ADDRESS_BASE_MAINNET) {
    console.warn(
      "USDC_ADDRESS_BASE_MAINNET not set - USDC payments on mainnet will be disabled"
    );
  }

  if (!process.env.USDC_ADDRESS_BASE_SEPOLIA) {
    console.warn(
      "USDC_ADDRESS_BASE_SEPOLIA not set - USDC payments on testnet will be disabled"
    );
  }

  return privateKey as `0x${string}` | null;
};

// ---------------------------------------------------------------------------
// Chain configuration
// ---------------------------------------------------------------------------
// Default to Base Sepolia (test-net) to avoid accidental main-net transactions
// and the "grantKeys returned no data (0x)" error that occurs when the contract
// isn't deployed on Base main-net. You can override the network by setting the
// environment variable BLOCKCHAIN_NETWORK to "base" (main-net) or
// "base-sepolia".

const resolveChain = () => {
  const network = (
    process.env.BLOCKCHAIN_NETWORK || "base-sepolia"
  ).toLowerCase();
  switch (network) {
    case "base":
    case "mainnet":
      return {
        chain: base,
        defaultRpc: "https://mainnet.base.org",
        usdcTokenAddress: process.env.USDC_ADDRESS_BASE_MAINNET,
        networkName: "Base Mainnet",
      } as const;
    case "base-sepolia":
    default:
      return {
        chain: baseSepolia,
        defaultRpc: "https://sepolia.base.org",
        usdcTokenAddress: process.env.USDC_ADDRESS_BASE_SEPOLIA,
        networkName: "Base Sepolia",
      } as const;
  }
};

const { chain, defaultRpc, usdcTokenAddress, networkName } = resolveChain();

// Run environment validation
validateEnvironment();

export const CHAIN_CONFIG = {
  chain,
  rpcUrl: process.env.BASE_RPC_URL || defaultRpc,
  usdcTokenAddress,
  networkName,
};

// Create account from private key - now returns null if private key isn't available
const createLockManagerAccount = (): Account | null => {
  try {
    const privateKey = validateEnvironment();
    if (!privateKey) return null;
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

// Create wallet client for writing to blockchain - now returns null if account isn't available
export const createBlockchainWalletClient = () => {
  const account = createLockManagerAccount();

  // If we don't have a private key, we can't create a wallet client
  if (!account) {
    console.warn("No private key available - write operations will not work");
    return null;
  }

  return createWalletClient({
    account,
    chain: CHAIN_CONFIG.chain,
    transport: http(CHAIN_CONFIG.rpcUrl),
  }) as WalletClient;
};

// Export chain ID for reference
export const CHAIN_ID = CHAIN_CONFIG.chain.id;
