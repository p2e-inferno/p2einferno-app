import { CURRENT_NETWORK } from "@/lib/blockchain/legacy/frontend-config";
import { type Address, isAddress } from "viem";

export function getWalletTransferTokenAddresses() {
  const dgAddr = process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET;
  const upAddr = process.env.NEXT_PUBLIC_UP_TOKEN_ADDRESS_BASE_MAINNET;

  return {
    usdc: CURRENT_NETWORK.usdcAddress as Address,
    // DG and UP intentionally stay on Base Mainnet to match wallet balance behavior.
    dg: (dgAddr && isAddress(dgAddr) ? (dgAddr as Address) : undefined),
    up: (upAddr && isAddress(upAddr) ? (upAddr as Address) : undefined),
  };
}

