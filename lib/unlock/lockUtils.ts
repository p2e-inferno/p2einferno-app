import { type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import { ethers, formatUnits, parseUnits } from "ethers";
import { UNIFIED_BLOCKCHAIN_CONFIG, getClientRpcUrls } from "../blockchain/config/unified-config";
import { blockchainLogger } from "../blockchain/shared/logging-utils";
import { createEthersReadOnlyProvider as createSharedReadOnlyProvider } from "../blockchain/shared/client-utils";
import { 
  ensureCorrectNetwork as ensureCorrectNetworkShared,
  getBlockExplorerUrl as getBlockExplorerUrlShared,
  type NetworkConfig 
} from "../blockchain/shared/network-utils";
import { PUBLIC_LOCK_CONTRACT } from "../../constants";

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
      { internalType: "bytes", name: "calldata", type: "bytes" },
      { internalType: "uint16", name: "version", type: "uint16" },
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
  return createSharedReadOnlyProvider();
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
    console.error(`Error fetching decimals for token ${tokenAddress}:`, error);
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

  console.log("🔧 [LOCK_UTILS] Creating ethers from wallet:", {
    address: wallet.address,
    walletClientType: wallet.walletClientType,
    connectorType: wallet.connectorType,
    type: wallet.type
  });

  // Handle different wallet types:
  let provider;

  if (typeof wallet.getEthereumProvider === "function") {
    // This is from useWallets() - has getEthereumProvider method
    console.log("🔧 [LOCK_UTILS] Using getEthereumProvider method");
    try {
      provider = await wallet.getEthereumProvider();
    } catch (error) {
      console.error("🔧 [LOCK_UTILS] Error getting Ethereum provider:", error);
      throw new Error("Failed to get Ethereum provider from wallet");
    }
  } else if (wallet.provider) {
    // This might be user.wallet with direct provider access
    console.log("🔧 [LOCK_UTILS] Using wallet.provider");
    provider = wallet.provider;
  } else if (wallet.walletClientType === 'injected' || wallet.connectorType === 'injected') {
    // This is an external wallet (MetaMask, etc.) - use window.ethereum
    console.log("🔧 [LOCK_UTILS] Using window.ethereum for injected wallet");
    if (typeof window !== "undefined" && (window as any).ethereum) {
      provider = (window as any).ethereum;
    } else {
      throw new Error("Window.ethereum not available. Please ensure MetaMask or another injected wallet is connected.");
    }
  } else {
    // Try to use window.ethereum as a fallback for external wallets
    console.log("🔧 [LOCK_UTILS] Trying window.ethereum as fallback");
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

  console.log("🔧 [LOCK_UTILS] Provider obtained:", provider);

  try {
    const ethersProvider = new ethers.BrowserProvider(provider);
    const signer = await ethersProvider.getSigner();

    console.log("🔧 [LOCK_UTILS] Ethers provider and signer created successfully");

    return { provider: ethersProvider, signer, rawProvider: provider };
  } catch (error) {
    console.error("🔧 [LOCK_UTILS] Error creating ethers provider:", error);
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
      console.warn(`Invalid lock address: ${lockAddress}`);
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
    console.error(`Error checking if user is lock manager for ${lockAddress}:`, error);
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
      console.warn(`Invalid lock address: ${lockAddress}`);
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
    console.error(`Error fetching total keys for ${lockAddress}:`, error);
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
    console.error(`Error fetching user key balance for ${lockAddress}:`, error);
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
    console.error(`Error fetching key price for ${lockAddress}:`, error);
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
    console.log(`Purchasing key for lock: ${lockAddress}`);

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

    // Get the key price and token address directly from the contract
    const onChainKeyPrice = await lockContract.keyPrice();
    const lockTokenAddress = await lockContract.tokenAddress();

    // Determine if this is ETH or ERC20 payment
    const isETHPayment =
      lockTokenAddress === "0x0000000000000000000000000000000000000000";

    console.log(`Lock token address: ${lockTokenAddress}`);
    console.log(`Key price from contract: ${onChainKeyPrice.toString()}`);
    console.log(`Payment type: ${isETHPayment ? "ETH" : "ERC20"}`);

    // Handle ERC20 token payments (USDC, etc.)
    if (!isETHPayment && onChainKeyPrice > 0n) {
      const tx = await lockContract.purchase(
        [onChainKeyPrice], // _values (exact token amount from contract)
        [wallet.address], // _recipients
        ["0x0000000000000000000000000000000000000000"], // _referrers
        ["0x0000000000000000000000000000000000000000"], // _keyManagers
        ["0x"] // _data
        // No ETH value for ERC20 payments
      );

      console.log("ERC20 purchase transaction sent:", tx.hash);

      const receipt = await tx.wait();
      console.log("Transaction receipt:", receipt);

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
      console.log(
        `Calling ETH purchase for recipient: ${
          wallet.address
        } with value: ${onChainKeyPrice.toString()} wei`
      );

      const tx = await lockContract.purchase(
        [onChainKeyPrice], // _values
        [wallet.address], // _recipients
        ["0x0000000000000000000000000000000000000000"], // _referrers
        ["0x0000000000000000000000000000000000000000"], // _keyManagers
        ["0x"], // _data
        {
          value: onChainKeyPrice, // Send ETH with the transaction
        }
      );

      console.log("ETH purchase transaction sent:", tx.hash);

      const receipt = await tx.wait();
      console.log("Transaction receipt:", receipt);

      if (receipt.status !== 1) {
        throw new Error("Transaction failed. Please try again.");
      }

      return {
        success: true,
        transactionHash: tx.hash,
      };
    }
  } catch (error) {
    console.error("Error purchasing key:", error);

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
  wallet: any
): Promise<DeploymentResult> => {
  try {
    console.log("Deploying lock with config:", config);

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
    console.log("Using Unlock Factory Address:", factoryAddress);

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

    console.log(
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
      wallet.address, // address of the first lock manager
      config.expirationDuration, // expirationDuration (in seconds)
      tokenAddress, // address of an ERC20 contract to use as currency (or 0x0 for native)
      keyPriceWei, // Amount to be paid
      config.maxNumberOfKeys, // Maximum number of NFTs that can be purchased
      config.name, // Name of membership contract
    ]);

    console.log("Creating lock with calldata and version:", version);

    // Create the lock
    const tx = await unlock.createUpgradeableLockAtVersion(calldata, version);
    console.log("Lock deployment transaction sent:", tx.hash);

    // Wait for transaction confirmation
    const receipt = await tx.wait();
    console.log("Transaction receipt:", receipt);

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
            console.log("Found lock address from NewLock event:", lockAddress);
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
              console.log(
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

    console.log("Lock deployed successfully:", {
      transactionHash: tx.hash,
      lockAddress: lockAddress,
    });

    return {
      success: true,
      transactionHash: tx.hash,
      lockAddress: lockAddress,
    };
  } catch (error) {
    console.error("Error deploying lock:", error);

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
    console.log(`Granting keys to ${recipients.length} recipients`);

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

    console.log("Grant keys transaction sent:", tx.hash);

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
    console.error("Error granting keys:", error);

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
    console.log("Add lock manager transaction sent:", tx.hash);

    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error("Transaction failed. Please try again.");
    }

    return {
      success: true,
      transactionHash: tx.hash,
    };
  } catch (error) {
    console.error("Error adding lock manager:", error);

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
