/**
 * EIP712 Type Definitions for DG Token Withdrawal
 *
 * Defines the typed data structure for withdrawal signatures.
 * Users sign this message client-side, server verifies it.
 */

export const WITHDRAWAL_DOMAIN = {
  name: "P2E Inferno DG Withdrawal",
  version: "1",
  chainId: 8453, // Base mainnet
  verifyingContract: process.env
    .NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as `0x${string}`,
};

export const WITHDRAWAL_TYPES = {
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
