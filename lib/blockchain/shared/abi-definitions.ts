/**
 * Consolidated ABI definitions and contract interfaces
 * Single source of truth for all smart contract ABIs
 */

import { PUBLIC_LOCK_CONTRACT } from "@/constants";

// ============================================================================
// UNLOCK PROTOCOL ABIS
// ============================================================================

/**
 * Unlock Factory ABI for lock creation
 */
export const UNLOCK_FACTORY_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "data", type: "bytes" },
      { internalType: "uint16", name: "lockVersion", type: "uint16" },
    ],
    name: "createUpgradeableLockAtVersion",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Additional Public Lock ABI functions for extended functionality
 */
export const ADDITIONAL_LOCK_ABI = [
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
    type: "function",
  },
] as const;

/**
 * Complete Public Lock ABI combining base and additional functions
 */
export const COMPLETE_LOCK_ABI = [
  ...PUBLIC_LOCK_CONTRACT.abi,
  ...ADDITIONAL_LOCK_ABI,
];

// ============================================================================
// ERC20 ABIS
// ============================================================================

/**
 * Standard ERC20 ABI functions needed for token operations
 */
export const ERC20_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
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
] as const;

// ============================================================================
// EVENT SIGNATURES
// ============================================================================

/**
 * Common event signatures for log parsing
 */
export const EVENT_SIGNATURES = {
  TRANSFER:
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  NEW_LOCK:
    "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7",
  APPROVAL:
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
} as const;

/**
 * Unlock Factory event interfaces for log parsing
 */
export const UNLOCK_FACTORY_EVENTS = [
  "event NewLock(address indexed lockOwner, address indexed newLockAddress)",
] as const;

// ============================================================================
// CONTRACT ADDRESSES
// ============================================================================

/**
 * Unlock Protocol factory contract addresses by chain ID
 */
export const UNLOCK_FACTORY_ADDRESSES = {
  8453: "0xd0b14797b9D08493392865647384974470202A78", // Base mainnet
  84532: "0x259813B665C8f6074391028ef782e27B65840d89", // Base Sepolia testnet
} as const;

// ============================================================================
// ABI UTILITIES
// ============================================================================

/**
 * Get the appropriate ABI for a given contract type
 */
export const getContractABI = (contractType: "lock" | "factory" | "erc20") => {
  switch (contractType) {
    case "lock":
      return COMPLETE_LOCK_ABI;
    case "factory":
      return UNLOCK_FACTORY_ABI;
    case "erc20":
      return ERC20_ABI;
    default:
      throw new Error(`Unknown contract type: ${contractType}`);
  }
};

/**
 * Check if an address is a valid Ethereum address
 */
export const isValidAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Check if an address is the zero address
 */
export const isZeroAddress = (address: string): boolean => {
  return address === "0x0000000000000000000000000000000000000000";
};
