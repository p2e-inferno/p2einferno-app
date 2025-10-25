/**
 * EIP712 Type Definitions for DG Token Withdrawal
 *
 * Defines the typed data structure for withdrawal signatures.
 * Users sign this message client-side, server verifies it.
 */

// Contract addresses by chain (extend as needed)
export const DG_CONTRACTS_BY_CHAIN: Record<number, `0x${string}` | undefined> = {
  8453: process.env
    .NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as `0x${string}` | undefined,
  84532: process.env
    .NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA as `0x${string}` | undefined,
};

export function getWithdrawalDomain(chainId: number) {
  const verifyingContract = DG_CONTRACTS_BY_CHAIN[chainId];
  if (!verifyingContract) {
    throw new Error(
      `DG token contract not configured for chainId ${chainId}. Please set the appropriate NEXT_PUBLIC_DG_TOKEN_ADDRESS_* env var.`,
    );
  }
  return {
    name: "P2E INFERNO DG PULLOUT",
    version: "1",
    chainId,
    verifyingContract,
  } as const;
}

export const WITHDRAWAL_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  Withdrawal: [
    { name: "user", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface WithdrawalMessage {
  user: `0x${string}`;
  amount: bigint;
  deadline: bigint; // Unix timestamp (seconds)
}
