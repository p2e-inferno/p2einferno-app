import { CURRENT_NETWORK } from "@/lib/blockchain/legacy/frontend-config";
import type { Address } from "viem";

export function getWalletTransferTokenAddresses() {
  return {
    usdc: CURRENT_NETWORK.usdcAddress as Address,
    // DG and UP intentionally stay on Base Mainnet to match wallet balance behavior.
    dg: process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as
      | Address
      | undefined,
    up: process.env.NEXT_PUBLIC_UP_TOKEN_ADDRESS_BASE_MAINNET as
      | Address
      | undefined,
  };
}

