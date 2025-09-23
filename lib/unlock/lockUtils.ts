import type { Address, Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { ethers, formatUnits, parseUnits } from "ethers";
import { UNIFIED_BLOCKCHAIN_CONFIG, getClientRpcUrls } from "../blockchain/config/unified-config";
import { blockchainLogger } from "../blockchain/shared/logging-utils";
import { getReadOnlyProvider as getUnifiedReadOnlyProvider } from "../blockchain/provider";
import { 
  ensureCorrectNetwork as ensureCorrectNetworkShared,
  getBlockExplorerUrl as getBlockExplorerUrlShared,
  type NetworkConfig 
} from "../blockchain/shared/network-utils";
import { PUBLIC_LOCK_CONTRACT } from "../../constants";
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('unlock:lockUtils');
const DEFAULT_LOCK_MANAGER_ADDRESS: Address = "0x7A2BF39919bb7e7bF3C0a96F005A0842CfDAa8ac"

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface LockConfig {
  name: string;
  symbol: string;
  keyPrice: string;
  maxNumberOfKeys: number;
  expirationDuration: number;
  currency: string;
  price: number;
  maxKeysPerAddress?: number;
  transferable?: boolean;
  requiresApproval?: boolean;
}

export interface DeploymentResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: string;
  error?: string;
}

export interface PurchaseResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export interface KeyInfo {
  tokenId: bigint;
  owner: Address;
  expirationTimestamp: bigint;
  isValid: boolean;
}

// ============================================================================
// UNLOCK PROTOCOL CONFIGURATION
// ============================================================================

// Unlock Protocol factory contract addresses
const UNLOCK_FACTORY_ADDRESSES = {
  [base.id]: "0xd0b14797b9D08493392865647384974470202A78", // Base mainnet
  [baseSepolia.id]: "0x259813B665C8f6074391028ef782e27B65840d89", // Base Sepolia testnet
} as const;

// Unlock factory ABI (simplified for lock creation)
const UNLOCK_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "bytes",   name: "data",        type: "bytes" },
      { internalType: "uint16",  name: "lockVersion", type: "uint16" },
      { internalType: "bytes[]", name: "transactions",type: "bytes[]" },
    ],
    name: "createUpgradeableLockAtVersion",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Additional ABI functions for lock management (extend existing PUBLIC_LOCK_CONTRACT.abi)
const ADDITIONAL_LOCK_ABI = [
  // Initialize function for lock creation
  {
    inputs: [
      { internalType: "address", name: "_lockCreator", type: "address" },
      { internalType: "uint256", name: "_expirationDuration", type: "uint256" },
      { internalType: "address", name: "_tokenAddress", type: "address" },
      { internalType: "uint256", name: "_keyPrice", type: "uint256" },
      { internalType: "uint256", name: "_maxNumberOfKeys", type: "uint256" },
      { internalType: "string", name: "_lockName", type: "string" },
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Purchase function for buying keys
  {
    inputs: [
      { internalType: "uint256[]", name: "_values", type: "uint256[]" },
      { internalType: "address[]", name: "_recipients", type: "address[]" },
      { internalType: "address[]", name: "_referrers", type: "address[]" },
      { internalType: "address[]", name: "_keyManagers", type: "address[]" },
      { internalType: "bytes[]", name: "_data", type: "bytes[]" },
    ],
    name: "purchase",
    outputs: [
      { internalType: "uint256[]", name: "tokenIds", type: "uint256[]" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  // Lock management functions
  {
    inputs: [{ internalType: "address", name: "_account", type: "address" }],
    name: "addLockManager",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_account", type: "address" }],
    name: "isLockManager",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Token address function to check what token the lock uses
  {
    inputs: [],
    name: "tokenAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // Renounce lock manager function
  { 
    inputs: [], 
    name: "renounceLockManager", 
    outputs: [], 
    stateMutability: "nonpayable", 
    type: "function" 
  },
] as const;

// ERC20 ABI for token operations
const ERC20_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Combine existing ABI with additional functions
const COMPLETE_LOCK_ABI = [...PUBLIC_LOCK_CONTRACT.abi, ...ADDITIONAL_LOCK_ABI];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create read-only provider for blockchain operations
 */
export const getReadOnlyProvider = () => {
  const { chain } = UNIFIED_BLOCKCHAIN_CONFIG;
  try {
    const urls = getClientRpcUrls();
    const hosts = urls.map((u) => { try { return new URL(u).host; } catch { return '[unparseable]'; } });
    blockchainLogger.debug('Creating read-only provider (fallback)', {
      operation: 'provider:create',
      order: hosts,
      chainId: chain.id,
    });
  } catch {}
  return getUnifiedReadOnlyProvider();
};

/**
 * Get factory address for current chain
 */
const getFactoryAddress = (): Address => {
  const factoryAddress =
    UNLOCK_FACTORY_ADDRESSES[
      UNIFIED_BLOCKCHAIN_CONFIG.chain.id as keyof typeof UNLOCK_FACTORY_ADDRESSES
    ];
  if (!factoryAddress) {
    throw new Error(
      `Unlock factory not supported on chain ${UNIFIED_BLOCKCHAIN_CONFIG.chain.id}`
    );
  }
  return factoryAddress;
};

/**
 * Get the number of decimals for a token
 */
const getTokenDecimals = async (tokenAddress: string): Promise<number> => {
  // ETH has 18 decimals
  if (tokenAddress === "0x0000000000000000000000000000000000000000") {
    return 18;
  }

  try {
    const provider = getReadOnlyProvider();
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    ) as any;
    const decimals = await tokenContract.decimals();
    return Number(decimals);
  } catch (error) {
    log.error(`Error fetching decimals for token ${tokenAddress}:`, error);
    return 18; // Default to 18 if we can't determine
  }
};



/**
 * Create ethers provider and signer from Privy wallet
 * Handles both user.wallet and wallets[0] wallet types, as well as external wallets
 */
const createEthersFromPrivyWallet = async (wallet: any) => {
  if (!wallet || !wallet.address) {
    throw new Error("No wallet provided or not connected.");
  }

  log.info("🔧 [LOCK_UTILS] Creating ethers from wallet:", {
    address: wallet.address,
    walletClientType: wallet.walletClientType,
    connectorType: wallet.connectorType,
    type: wallet.type
  });

  // Handle different wallet types:
  let provider: any;

  if (typeof wallet.getEthereumProvider === "function") {
    // This is from useWallets() - has getEthereumProvider method
    log.info("🔧 [LOCK_UTILS] Using getEthereumProvider method");
    try {
      provider = await wallet.getEthereumProvider();
    } catch (error) {
      log.error("🔧 [LOCK_UTILS] Error getting Ethereum provider:", error);
      throw new Error("Failed to get Ethereum provider from wallet");
    }
  } else if (wallet.provider) {
    // This might be user.wallet with direct provider access
    log.info("🔧 [LOCK_UTILS] Using wallet.provider");
    provider = wallet.provider;
  } else if (wallet.walletClientType === 'injected' || wallet.connectorType === 'injected') {
    // This is an external wallet (MetaMask, etc.) - use window.ethereum
    log.info("🔧 [LOCK_UTILS] Using window.ethereum for injected wallet");
    if (typeof window !== "undefined" && (window as any).ethereum) {
      provider = (window as any).ethereum;
    } else {
      throw new Error("Window.ethereum not available. Please ensure MetaMask or another injected wallet is connected.");
    }
  } else {
    // Try to use window.ethereum as a fallback for external wallets
    log.info("🔧 [LOCK_UTILS] Trying window.ethereum as fallback");
    if (typeof window !== "undefined" && (window as any).ethereum) {
      provider = (window as any).ethereum;
    } else {
      throw new Error(
        "Unable to access Ethereum provider from wallet. Please ensure wallet is properly connected."
      );
    }
  }

  if (!provider) {
    throw new Error("No provider available for wallet");
  }

  // Avoid logging the raw provider object (can be recursive/circular)
  try {
    const provDesc = {
      hasRequest: typeof provider?.request === 'function',
      hasSend: typeof provider?.send === 'function',
      hasGetSigner: typeof provider?.getSigner === 'function',
      isBrowserProvider: provider instanceof ethers.BrowserProvider,
      ctor: provider?.constructor?.name,
    };
    log.info("🔧 [LOCK_UTILS] Provider obtained (summary):", provDesc);
  } catch {}

  try {
    // If provider is already an ethers BrowserProvider, use it directly to avoid recursive wrapping
    const ethersProvider = provider instanceof ethers.BrowserProvider
      ? provider
      : new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    // Normalize rawProvider to an EIP-1193 provider for network switching
    // Prefer a .request-capable object; fall back to underlying provider or window.ethereum
    const rawProviderNormalized = (provider as any)?.request
      ? provider
      : ((provider as any)?.provider ?? (typeof window !== 'undefined' ? (window as any).ethereum : provider));

    log.info("🔧 [LOCK_UTILS] Ethers provider and signer created successfully");

    return { provider: ethersProvider, signer, rawProvider: rawProviderNormalized };
  } catch (error) {
    log.error("🔧 [LOCK_UTILS] Error creating ethers provider:", error);
    throw new Error("Failed to create ethers provider from wallet");
  }
};

/**
 * Switch to the correct network for Unlock operations
 * Uses shared network utilities
 */
const ensureCorrectNetwork = async (rawProvider: any) => {
  const networkConfig: NetworkConfig = {
    chain: UNIFIED_BLOCKCHAIN_CONFIG.chain,
    rpcUrl: UNIFIED_BLOCKCHAIN_CONFIG.rpcUrl,
    networkName: UNIFIED_BLOCKCHAIN_CONFIG.networkName,
  };
  
  return ensureCorrectNetworkShared(rawProvider, networkConfig);
};

/**
 * Get block explorer URL for transaction
 * Uses shared network utilities
 */
export const getBlockExplorerUrl = (txHash: string): string => {
  const networkConfig: NetworkConfig = {
    chain: UNIFIED_BLOCKCHAIN_CONFIG.chain,
    rpcUrl: UNIFIED_BLOCKCHAIN_CONFIG.rpcUrl,
    networkName: UNIFIED_BLOCKCHAIN_CONFIG.networkName,
  };
  
  return getBlockExplorerUrlShared(txHash, networkConfig);
};

// ============================================================================
// READ-ONLY OPERATIONS (No wallet required)
// ============================================================================

/**
 * Checks if a user is a lock manager for a lock
 */
export const getIsLockManager = async (lockAddress: string, wallet: any): Promise<boolean> => {
  try {
    if (
      !lockAddress ||
      lockAddress === "Unknown" ||
      !ethers.isAddress(lockAddress)
    ) {
      log.warn(`Invalid lock address: ${lockAddress}`);
      return false;
    }

    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      provider
    ) as any;
    const isManager = await lockContract.isLockManager(wallet.address);
    return isManager;
  } catch (error) {
    log.error(`Error checking if user is lock manager for ${lockAddress}:`, error);
    return false;
  }
};


/**
 * Gets the total number of keys that have been sold for a lock
 */
export const getTotalKeys = async (lockAddress: string): Promise<number> => {
  try {
    if (
      !lockAddress ||
      lockAddress === "Unknown" ||
      !ethers.isAddress(lockAddress)
    ) {
      log.warn(`Invalid lock address: ${lockAddress}`);
      return 0;
    }

    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      provider
    ) as any;
    const totalSupply = await lockContract.totalSupply();
    return Number(totalSupply);
  } catch (error) {
    log.error(`Error fetching total keys for ${lockAddress}:`, error);
    return 0;
  }
};

/**
 * Checks if a user has a valid, non-expired key for a specific lock
 */
export const checkKeyOwnership = async (
  lockAddress: string,
  userAddress: string
): Promise<boolean> => {
  try {
    const start = Date.now();
    if (!ethers.isAddress(lockAddress) || !ethers.isAddress(userAddress)) {
      blockchainLogger.warn('Invalid addresses for key ownership check', {
        operation: 'keyCheck',
        lockAddress,
        userAddress,
      });
      return false;
    }

    if (lockAddress === "Unknown") {
      blockchainLogger.warn('Key check skipped for unknown lock address', {
        operation: 'keyCheck',
        lockAddress,
        userAddress,
      });
      return false;
    }

    const { rpcUrl, chain } = UNIFIED_BLOCKCHAIN_CONFIG;
    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      provider
    ) as any;

    blockchainLogger.debug('Invoking getHasValidKey', {
      operation: 'keyCheck',
      lockAddress,
      userAddress,
      chainId: chain.id,
      rpcHost: (() => { try { return new URL(rpcUrl).host; } catch { return '[unparseable]'; } })(),
    });

    const hasKey = await lockContract.getHasValidKey(userAddress);
    const durationMs = Date.now() - start;
    blockchainLogger.logKeyCheck(lockAddress, userAddress, !!hasKey);
    blockchainLogger.info('Key ownership check completed', {
      operation: 'keyCheck',
      durationMs,
      lockAddress,
      userAddress,
    });
    return hasKey;
  } catch (error) {
    blockchainLogger.error(`Error checking key ownership for ${lockAddress}`, {
      operation: 'keyCheck',
      lockAddress,
      userAddress,
      error: (error as any)?.message || String(error),
    });
    return false;
  }
};

/**
 * Gets the number of keys (tickets) owned by a specific user for a lock
 */
export const getUserKeyBalance = async (
  lockAddress: string,
  userAddress: string
): Promise<number> => {
  try {
    if (!ethers.isAddress(lockAddress) || !ethers.isAddress(userAddress)) {
      return 0;
    }

    if (lockAddress === "Unknown") {
      return 0;
    }

    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      provider
    ) as any;
    const balance = await lockContract.balanceOf(userAddress);
    return Number(balance);
  } catch (error) {
    log.error(`Error fetching user key balance for ${lockAddress}:`, error);
    return 0;
  }
};

/**
 * Gets the current key price for a lock with proper decimal formatting
 */
export const getKeyPrice = async (
  lockAddress: string
): Promise<{
  price: bigint;
  priceFormatted: string;
  tokenAddress: string;
  decimals: number;
}> => {
  try {
    if (!ethers.isAddress(lockAddress) || lockAddress === "Unknown") {
      return {
        price: 0n,
        priceFormatted: "0",
        tokenAddress: "0x0000000000000000000000000000000000000000",
        decimals: 18,
      };
    }

    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      provider
    ) as any;

    // Get both price and token address from the contract
    const price = await lockContract.keyPrice();
    const tokenAddress = await lockContract.tokenAddress();

    // Get the correct decimals for this token
    const decimals = await getTokenDecimals(tokenAddress);

    // Format the price using the correct decimals
    const priceFormatted = formatUnits(BigInt(price.toString()), decimals);

    return {
      price: BigInt(price.toString()),
      priceFormatted,
      tokenAddress,
      decimals,
    };
  } catch (error) {
    log.error(`Error fetching key price for ${lockAddress}:`, error);
    return {
      price: 0n,
      priceFormatted: "0",
      tokenAddress: "0x0000000000000000000000000000000000000000",
      decimals: 18,
    };
  }
};

// ============================================================================
// WALLET-REQUIRED OPERATIONS
// ============================================================================

/**
 * Purchase a key from an existing lock using Privy wallet
 * Supports both ETH and ERC20 payments automatically based on lock configuration
 */
export const purchaseKey = async (
  lockAddress: string,
  wallet: any
): Promise<PurchaseResult> => {
  try {
    log.info(`Purchasing key for lock: ${lockAddress}`);

    // Validate lock address
    if (
      !lockAddress ||
      lockAddress === "Unknown" ||
      !ethers.isAddress(lockAddress)
    ) {
      throw new Error(
        "Invalid lock address. The lock may not have been properly deployed."
      );
    }

    // Create ethers provider from Privy wallet
    const { signer, rawProvider } = await createEthersFromPrivyWallet(wallet);

    // Ensure we're on the correct network
    await ensureCorrectNetwork(rawProvider);

    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      signer
    ) as any;

    // Resolve signer address to avoid mismatch with provided wallet object
    let signerAddress: string;
    try {
      signerAddress = await signer.getAddress();
    } catch {
      signerAddress = wallet.address;
    }
    const effectiveAddress = signerAddress || wallet.address;

    // Get the key price and token address directly from the contract
    const onChainKeyPrice = await lockContract.keyPrice();
    const lockTokenAddress = await lockContract.tokenAddress();

  // Determine if this is ETH or ERC20 payment
  const isETHPayment =
      lockTokenAddress === "0x0000000000000000000000000000000000000000";

    // Handle ERC20 token payments (USDC, etc.)
    if (!isETHPayment && onChainKeyPrice > 0n) {
      // Ensure sufficient token balance and allowance
      const tokenContract = new ethers.Contract(
        lockTokenAddress,
        ERC20_ABI,
        signer
      ) as any;

      const [balance, allowance] = await Promise.all([
        tokenContract.balanceOf(effectiveAddress),
        tokenContract.allowance(effectiveAddress, lockAddress),
      ]);

      if (balance < onChainKeyPrice) {
        throw new Error(
          "Insufficient token balance to purchase the key. Please fund your wallet with the required stablecoin."
        );
      }

      if (allowance < onChainKeyPrice) {
        log.info(
          `Approving spender ${lockAddress} for ${onChainKeyPrice.toString()} tokens`
        );
        try {
          const approveAmount = onChainKeyPrice; // could be maxUint; keep exact to be conservative
          const approveTx = await tokenContract.approve(lockAddress, approveAmount);
          log.info('[LOCK_UTILS] Sent approve tx:', approveTx?.hash);
          await approveTx.wait();
          log.info('[LOCK_UTILS] Approve tx mined, verifying allowance...');

          // Poll for the updated allowance (in case of RPC/provider lag)
          const maxChecks = 12; // ~6 seconds @ 500ms
          for (let i = 0; i < maxChecks; i++) {
            const newAllowance = await tokenContract.allowance(effectiveAddress, lockAddress);
            log.info(`[LOCK_UTILS] Allowance check ${i + 1}/${maxChecks}:`, newAllowance?.toString?.());
            if (newAllowance >= onChainKeyPrice) {
              break;
            }
            await new Promise((r) => setTimeout(r, 500));
            if (i === maxChecks - 1) {
              throw new Error('Approval mined but allowance not updated yet. Please try again in a few seconds.');
            }
          }
        } catch (approveErr: any) {
          // Some tokens require resetting allowance to 0 first
          if (
            approveErr?.message &&
            approveErr.message.toLowerCase().includes("must be zero")
          ) {
            const resetTx = await tokenContract.approve(lockAddress, 0);
            await resetTx.wait();
            const approveTx = await tokenContract.approve(
              lockAddress,
              onChainKeyPrice
            );
            await approveTx.wait();
            // After reset+approve, verify allowance
            const verifiedAllowance = await tokenContract.allowance(effectiveAddress, lockAddress);
            if (verifiedAllowance < onChainKeyPrice) {
              throw new Error('Allowance still insufficient after reset/approve. Please retry.');
            }
          } else {
            throw approveErr;
          }
        }
      }

      // For ERC20 payments, no ETH is sent; _values should be 0
      const tx = await lockContract.purchase(
        [onChainKeyPrice], // _ for ERC20
        [effectiveAddress], // _recipients
        ["0x0000000000000000000000000000000000000000"], // _referrers
        ["0x0000000000000000000000000000000000000000"], // _keyManagers
        ["0x"] // _data
      );

      log.info("ERC20 purchase transaction sent:", tx.hash);

      const receipt = await tx.wait();
      log.info("Transaction receipt:", receipt);

      if (receipt.status !== 1) {
        throw new Error("Transaction failed. Please try again.");
      }

      return {
        success: true,
        transactionHash: tx.hash,
      };
    }

    // Handle ETH payments
    else {
      log.info(`Calling ETH purchase for recipient: ${effectiveAddress} with value: ${onChainKeyPrice.toString()} wei`);

      const tx = await lockContract.purchase(
        [onChainKeyPrice], // _values
        [effectiveAddress], // _recipients
        ["0x0000000000000000000000000000000000000000"], // _referrers
        ["0x0000000000000000000000000000000000000000"], // _keyManagers
        ["0x"], // _data
        {
          value: onChainKeyPrice, // Send ETH with the transaction
        }
      );

      log.info("ETH purchase transaction sent:", tx.hash);

      const receipt = await tx.wait();
      log.info("Transaction receipt:", receipt);

      if (receipt.status !== 1) {
        throw new Error("Transaction failed. Please try again.");
      }

      return {
        success: true,
        transactionHash: tx.hash,
      };
    }
  } catch (error) {
    log.error("Error purchasing key:", error);

    let errorMessage = "Failed to purchase key.";
    if (error instanceof Error) {
      if (
        error.message.includes("User rejected") ||
        error.message.includes("user rejected")
      ) {
        errorMessage =
          "Transaction was cancelled. Please try again when ready.";
      } else if (error.message.includes("insufficient funds")) {
        errorMessage =
          "Insufficient funds to purchase the key. Please add more crypto to your wallet.";
      } else if (
        error.message.includes("missing revert data") ||
        error.message.includes("CALL_EXCEPTION")
      ) {
        errorMessage =
          "The transaction could not be simulated. Ensure you have enough stablecoin balance and have approved the lock to spend your tokens, and that you're on the correct network.";
      } else if (error.message.includes("ERC20: insufficient allowance")) {
        errorMessage =
          "Please approve the USDC spending first. The approval transaction will be requested before payment.";
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

// ============================================================================
// ADVANCED FEATURES (Lock Creation & Management)
// ============================================================================

/**
 * Deploy a new Unlock Protocol lock
 */
export const deployLock = async (
  config: LockConfig,
  wallet: any,
  extraManagerAddress?: string // optional extra manager to add
): Promise<DeploymentResult> => {
  try {
    log.info("Deploying lock with config:", config);

    if (!wallet || !wallet.address) {
      throw new Error("No wallet provided. Please connect your wallet first.");
    }
    const usdcTokenAddress = UNIFIED_BLOCKCHAIN_CONFIG.usdcTokenAddress;
    if (!usdcTokenAddress) {
      throw new Error(`USDC token address not configured for ${UNIFIED_BLOCKCHAIN_CONFIG.networkName}.`);
    }
    // Create ethers provider from Privy wallet
    const { signer, rawProvider } = await createEthersFromPrivyWallet(wallet);

    // Ensure we're on the correct network
    await ensureCorrectNetwork(rawProvider);

    const factoryAddress = getFactoryAddress();
    log.info("Using Unlock Factory Address:", factoryAddress);

    // Version must match the PublicLock version (using v14 as per successful transaction)
    const version = 14;

    // Create an instance of the Unlock factory contract
    const unlock = new ethers.Contract(
      factoryAddress,
      UNLOCK_FACTORY_ABI,
      signer
    ) as any;

    const usdcContract = new ethers.Contract(
      usdcTokenAddress,
      ERC20_ABI,
      signer
    ) as any;
    const usdcDecimals = await usdcContract.decimals();

    // Convert price to wei (assuming USDC with 6 decimals, but Unlock uses 18 decimal representation)
    const keyPriceWei =
      config.currency === "FREE" ? 0n : parseUnits(config.price.toString(), usdcDecimals);

    // Use USDC token address for payments (0x0 for native ETH, but we prefer USDC)
    const tokenAddress =
      config.currency === "FREE"
        ? "0x0000000000000000000000000000000000000000" // Free locks use ETH address
        : usdcTokenAddress;

    log.info(
      `Deploying lock with token address: ${tokenAddress} (${
        tokenAddress === "0x0000000000000000000000000000000000000000"
          ? "ETH"
          : "USDC"
      })`
    );

    // Create calldata using PublicLock's ABI to encode the initialize function
    const lockInterface = new ethers.Interface([
      {
        inputs: [
          { internalType: "address", name: "_lockCreator", type: "address" },
          { internalType: "uint256", name: "_expirationDuration", type: "uint256" },
          { internalType: "address", name: "_tokenAddress", type: "address" },
          { internalType: "uint256", name: "_keyPrice", type: "uint256" },
          { internalType: "uint256", name: "_maxNumberOfKeys", type: "uint256" },
          { internalType: "string", name: "_lockName", type: "string" },
        ],
        name: "initialize",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      }
    ]);
    const calldata = lockInterface.encodeFunctionData("initialize", [
      factoryAddress, // address of the first lock manager (factory address)
      config.expirationDuration, // expirationDuration (in seconds)
      tokenAddress, // address of an ERC20 contract to use as currency (or 0x0 for native)
      keyPriceWei, // Amount to be paid
      config.maxNumberOfKeys, // Maximum number of NFTs that can be purchased
      config.name, // Name of membership contract
    ]);

    const lockMgmtIface = new ethers.Interface([
      {
        inputs: [{ internalType: "address", name: "_account", type: "address" }],
        name: "addLockManager",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      { 
        inputs: [], 
        name: "renounceLockManager", 
        outputs: [], 
        stateMutability: "nonpayable", 
        type: "function" 
      }
    ]);

    const txnCalldatas: Hex[] = [];
    txnCalldatas.push(lockMgmtIface.encodeFunctionData("addLockManager", [wallet.address]));
    txnCalldatas.push(lockMgmtIface.encodeFunctionData("addLockManager", [extraManagerAddress ?? DEFAULT_LOCK_MANAGER_ADDRESS]));
    txnCalldatas.push(lockMgmtIface.encodeFunctionData("renounceLockManager")); // removes factory address as lock manager

    log.info("Creating lock with calldata and version:", version);

    // Create the lock
    const tx = await unlock.createUpgradeableLockAtVersion(calldata, version, txnCalldatas);
    log.info("Lock deployment transaction sent:", tx.hash);

    // Wait for transaction confirmation
    const receipt = await tx.wait();
    log.info("Transaction receipt summary", {
      hash: receipt?.hash ?? tx.hash,
      status: receipt?.status,
      confirmations: receipt?.confirmations,
      logCount: Array.isArray(receipt?.logs) ? receipt.logs.length : 0,
    });

    if (receipt.status !== 1) {
      throw new Error("Transaction failed. Please try again.");
    }

    // Extract lock address from the return value or logs
    let lockAddress = "Unknown";

    // Parse logs to find the NewLock event
    if (receipt.logs && receipt.logs.length > 0) {
      // Create an interface for the Unlock factory to parse logs
      const unlockInterface = new ethers.Interface([
        "event NewLock(address indexed lockOwner, address indexed newLockAddress)",
      ]);

      // Parse all logs to find the NewLock event
      for (const log of receipt.logs) {
        try {
          const parsedLog = unlockInterface.parseLog({
            topics: log.topics,
            data: log.data,
          });

          if (parsedLog && parsedLog.name === "NewLock") {
            lockAddress = parsedLog.args.newLockAddress;
            log.info("Found lock address from NewLock event:", lockAddress);
            break;
          }
        } catch (e) {
          // This log isn't a NewLock event, continue
          continue;
        }
      }
    }

    // If we still don't have a valid address, try alternative extraction
    if (lockAddress === "Unknown" && receipt.logs && receipt.logs.length > 0) {
      // Look for any log that might contain an address
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      for (const log of receipt.logs) {
        if (log.topics && log.topics.length > 1) {
          for (let i = 1; i < log.topics.length; i++) {
            const potentialAddress = `0x${log.topics[i].slice(-40)}`;
            if (
              addressRegex.test(potentialAddress) &&
              potentialAddress !== wallet.address
            ) {
              lockAddress = potentialAddress;
              log.info(
                "Found potential lock address from log topics:",
                lockAddress
              );
              break;
            }
          }
          if (lockAddress !== "Unknown") break;
        }
      }
    }

    log.info("Lock deployed successfully:", {
      transactionHash: tx.hash,
      lockAddress: lockAddress,
    });

    return {
      success: true,
      transactionHash: tx.hash,
      lockAddress: lockAddress,
    };
  } catch (error) {
    log.error("Error deploying lock", {
      message: error instanceof Error ? error.message : String(error),
      name: (error as any)?.name,
      code: (error as any)?.code,
    });

    let errorMessage = "Failed to deploy lock";

    if (error instanceof Error) {
      if (
        error.message.includes("User rejected") ||
        error.message.includes("user rejected")
      ) {
        errorMessage =
          "Transaction was cancelled. Please try again when ready.";
      } else if (error.message.includes("insufficient funds")) {
        errorMessage =
          "Insufficient funds to deploy the smart contract. Please add more ETH to your wallet.";
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Grant keys to users (requires lock manager permissions)
 */
export const grantKeys = async (
  lockAddress: string,
  recipients: string[],
  expirationTimestamps: bigint[],
  wallet: any,
  keyManagers?: string[]
): Promise<{
  success: boolean;
  error?: string;
  transactionHash?: string;
  tokenIds?: string[];
}> => {
  try {
    log.info(`Granting keys to ${recipients.length} recipients`);

    // Validate inputs
    if (
      !lockAddress ||
      lockAddress === "Unknown" ||
      !ethers.isAddress(lockAddress)
    ) {
      throw new Error("Invalid lock address.");
    }

    if (!wallet || !wallet.address) {
      throw new Error("No wallet provided or not connected.");
    }

    if (recipients.length !== expirationTimestamps.length) {
      throw new Error(
        "Recipients and expiration timestamps arrays must have the same length."
      );
    }

    // Create ethers provider from Privy wallet
    const { signer, rawProvider } = await createEthersFromPrivyWallet(wallet);

    // Ensure we're on the correct network
    await ensureCorrectNetwork(rawProvider);

    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      signer
    ) as any;

    // Check if user is a lock manager
    const isManager = await lockContract.isLockManager(wallet.address);
    if (!isManager) {
      throw new Error("You must be a lock manager to grant keys.");
    }

    // Prepare key managers array (default to zero address if not provided)
    const keyManagersArray =
      keyManagers ||
      recipients.map(() => "0x0000000000000000000000000000000000000000");

    // Grant the keys using correct parameter order: recipients, expirationTimestamps, keyManagers
    const tx = await lockContract.grantKeys(
      recipients,
      expirationTimestamps,
      keyManagersArray
    );

    log.info("Grant keys transaction sent:", tx.hash);

    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error("Transaction failed. Please try again.");
    }

    // Extract token IDs from Transfer events
    const tokenIds: string[] = [];
    if (receipt.logs) {
      const transferEventTopic =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

      for (const log of receipt.logs) {
        if (log.topics[0] === transferEventTopic) {
          // Transfer event: from, to, tokenId
          const tokenId = BigInt(log.topics[3]).toString();
          tokenIds.push(tokenId);
        }
      }
    }

    return {
      success: true,
      transactionHash: tx.hash,
      tokenIds,
    };
  } catch (error) {
    log.error("Error granting keys:", error);

    let errorMessage = "Failed to grant keys.";
    if (error instanceof Error) {
      if (
        error.message.includes("User rejected") ||
        error.message.includes("user rejected")
      ) {
        errorMessage =
          "Transaction was cancelled. Please try again when ready.";
      } else if (error.message.includes("insufficient funds")) {
        errorMessage =
          "Insufficient funds to complete the transaction. Please add more ETH to your wallet.";
      } else {
        errorMessage = error.message;
      }
    }

    return { success: false, error: errorMessage };
  }
};

/**
 * Add a lock manager to an existing lock
 */
export const addLockManager = async (
  lockAddress: string,
  managerAddress: string,
  wallet: any
): Promise<{ success: boolean; error?: string; transactionHash?: string }> => {
  try {
    if (
      !lockAddress ||
      lockAddress === "Unknown" ||
      !ethers.isAddress(lockAddress)
    ) {
      throw new Error("Invalid lock address.");
    }

    if (!ethers.isAddress(managerAddress)) {
      throw new Error("Invalid manager address.");
    }

    if (!wallet || !wallet.address) {
      throw new Error("No wallet provided or not connected.");
    }

    // Create ethers provider from Privy wallet
    const { signer, rawProvider } = await createEthersFromPrivyWallet(wallet);

    // Ensure we're on the correct network
    await ensureCorrectNetwork(rawProvider);

    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      signer
    ) as any;

    // Check if user is a lock manager
    const isManager = await lockContract.isLockManager(wallet.address);
    if (!isManager) {
      throw new Error(
        "You must be a lock manager to add another lock manager."
      );
    }

    // Add the new lock manager
    const tx = await lockContract.addLockManager(managerAddress);
    log.info("Add lock manager transaction sent:", tx.hash);

    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error("Transaction failed. Please try again.");
    }

    return {
      success: true,
      transactionHash: tx.hash,
    };
  } catch (error) {
    log.error("Error adding lock manager:", error);

    let errorMessage = "Failed to add lock manager.";
    if (error instanceof Error) {
      if (
        error.message.includes("User rejected") ||
        error.message.includes("user rejected")
      ) {
        errorMessage =
          "Transaction was cancelled. Please try again when ready.";
      } else if (error.message.includes("insufficient funds")) {
        errorMessage =
          "Insufficient funds to complete the transaction. Please add more ETH to your wallet.";
      } else {
        errorMessage = error.message;
      }
    }

    return { success: false, error: errorMessage };
  }
};

// Export a comprehensive interface for all functions
export const unlockUtils = {
  // Read-only operations
  getTotalKeys,
  checkKeyOwnership,
  getUserKeyBalance,
  getKeyPrice,
  getIsLockManager,

  // Wallet operations
  purchaseKey,

  // Advanced lock management
  deployLock,
  grantKeys,
  addLockManager,

  // Utilities
  getBlockExplorerUrl,
} as const;

export default unlockUtils;
