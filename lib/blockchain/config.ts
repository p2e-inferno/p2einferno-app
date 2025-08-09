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

// Validate environment variables - secure validation without exposing details
const validateEnvironment = () => {
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.warn("Blockchain write operations disabled - missing configuration");
    return null;
  }

  // Validate format without logging details
  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    console.error("Invalid private key format - write operations disabled");
    return null;
  }

  // Silent validation for USDC addresses - only warn if both missing
  const hasMainnetUsdc = !!process.env.USDC_ADDRESS_BASE_MAINNET;
  const hasSepoliaUsdc = !!process.env.USDC_ADDRESS_BASE_SEPOLIA;
  
  if (!hasMainnetUsdc && !hasSepoliaUsdc) {
    console.warn("USDC token addresses not configured - payments may be limited");
  }

  return privateKey as `0x${string}`;
};

// ---------------------------------------------------------------------------
// Chain configuration
// ---------------------------------------------------------------------------
// Default to Base Sepolia (test-net) to avoid accidental main-net transactions
// and the "grantKeys returned no data (0x)" error that occurs when the contract
// isn't deployed on Base main-net. You can override the network by setting the
// environment variable NEXT_PUBLIC_BLOCKCHAIN_NETWORK to "base" (main-net) or
// "base-sepolia".

const resolveChain = () => {
  const network = (
    process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "base-sepolia"
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
