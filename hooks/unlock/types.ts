import type { Address } from "viem";

export interface UnlockHookOptions {
  enabled?: boolean;
}

export interface KeyInfo {
  tokenId: bigint;
  owner: Address;
  expirationTimestamp: bigint;
  isValid: boolean;
}

export interface LockInfo {
  tokenAddress: Address;
  keyPrice: bigint;
  isValid: boolean;
}
