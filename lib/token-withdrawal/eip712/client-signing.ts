/**
 * Client-Side EIP712 Signature Generation
 *
 * Used in the browser to sign withdrawal requests with the user's wallet.
 * The signature proves the user authorized this specific withdrawal.
 */

import { WITHDRAWAL_TYPES, type WithdrawalMessage } from "./types";
import type { BrowserProvider, Signer } from "ethers";

/**
 * Sign a withdrawal message using EIP712 typed data
 *
 * @param walletAddress User's wallet address
 * @param amountDG Amount in DG tokens (integer, not wei)
 * @param deadline Unix timestamp (seconds) when signature expires
 * @param signerProvider Privy wallet or ethers provider with signTypedData method
 * @returns EIP712 signature string
 */
export async function signWithdrawalMessage(
  walletAddress: `0x${string}`,
  amountDG: number,
  deadline: bigint,
  signerProvider: any, // Privy wallet or ethers provider
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  },
): Promise<string> {
  // Convert DG amount to wei for signing (18 decimals)
  const amountWei = BigInt(amountDG) * BigInt(10 ** 18);

  const message: WithdrawalMessage = {
    user: walletAddress,
    amount: amountWei,
    deadline,
  };

  // Prefer a native signTypedData if available (Privy embedded wallet)
  if (signerProvider && typeof signerProvider.signTypedData === "function") {
    const signature = await signerProvider.signTypedData({
      domain,
      types: WITHDRAWAL_TYPES,
      primaryType: "Withdrawal",
      message,
    });
    return signature;
  }

  // Fallback: use ethers.js with the active browser wallet (e.g., MetaMask)
  if (typeof window !== "undefined" && (window as any).ethereum) {
    const ethers = await import("ethers");
    const provider: BrowserProvider = new ethers.BrowserProvider(
      (window as any).ethereum,
    );
    const signer: Signer = await provider.getSigner();
    // Ethers v6 supports signTypedData(domain, types, value)
    // Cast types to any to satisfy the signer method signature
    const signature = await (signer as any).signTypedData(
      domain,
      WITHDRAWAL_TYPES as any,
      message,
    );
    return signature as string;
  }

  throw new Error(
    "Typed data signing is not available. Please connect an Ethereum wallet that supports EIP-712 signing.",
  );
}
