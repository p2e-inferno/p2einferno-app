/**
 * Hook: useDGWithdrawal
 *
 * Main withdrawal orchestration hook that:
 * 1. Signs EIP712 withdrawal message
 * 2. Submits withdrawal request to API
 * 3. Tracks loading and error states
 */

import { useState } from "react";
import {
  usePrivy,
  useWallets,
  useSignTypedData,
  toViemAccount,
} from "@privy-io/react-auth";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { signWithdrawalMessage } from "@/lib/token-withdrawal/eip712/client-signing";
import {
  getWithdrawalDomain,
  WITHDRAWAL_TYPES,
  type WithdrawalMessage,
} from "@/lib/token-withdrawal/eip712/types";
import { getLogger } from "@/lib/utils/logger";
import { getClientConfig } from "@/lib/blockchain/config";
import { ensureCorrectNetwork } from "@/lib/blockchain/shared/network-utils";

const log = getLogger("hooks:useDGWithdrawal");

export interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  withdrawalId?: string;
  error?: string;
}

function isUserRejectedError(err: any): boolean {
  const code = err?.code;
  const name = (err?.name || "").toString().toLowerCase();
  const msg = (err?.message || "").toString().toLowerCase();
  return (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    name.includes("userrejected") ||
    msg.includes("user rejected") ||
    msg.includes("rejected") ||
    msg.includes("denied") ||
    msg.includes("cancel") ||
    msg.includes("canceled") ||
    msg.includes("cancelled")
  );
}

export function useDGWithdrawal() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const writeWallet = usePrivyWriteWallet() as any;
  const { signTypedData } = useSignTypedData();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const initiateWithdrawal = async (
    amountDG: number
  ): Promise<WithdrawalResult> => {
    try {
      setIsLoading(true);
      setError(null);
      setTxHash(null);

      if (!user || !wallets || wallets.length === 0 || !writeWallet) {
        throw new Error("Wallet not connected");
      }

      const wallet = writeWallet;
      if (!wallet?.address) {
        throw new Error("Wallet address not available");
      }
      const walletAddress = wallet.address;
      const isEmbedded = (wallet as any)?.walletClientType === "privy";

      // Get target network from environment config (defaults to Base Sepolia)
      const clientConfig = getClientConfig();
      const chainId = clientConfig.chainId;

      // Ensure wallet is on the correct network
      const rawProvider =
        typeof (wallet as any)?.getEthereumProvider === "function"
          ? await (wallet as any).getEthereumProvider()
          : typeof window !== "undefined"
          ? (window as any).ethereum
          : null;

      if (!rawProvider) {
        throw new Error("Unable to access Ethereum provider");
      }

      await ensureCorrectNetwork(rawProvider, {
        chain: clientConfig.chain,
        rpcUrl: clientConfig.rpcUrl,
        networkName: clientConfig.networkName,
      });

      const domain = getWithdrawalDomain(chainId);

      // 1. Calculate deadline (15 minutes from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);

      // 2. Sign EIP712 message - Prefer Privy's native hook for embedded wallets
      const amountWei = BigInt(amountDG) * BigInt(10 ** 18);
      const messageBig: WithdrawalMessage = {
        user: walletAddress as `0x${string}`,
        amount: amountWei,
        deadline,
      };
      // For Privy hook and MetaMask: use string representation of BigInt values
      const messageStr = {
        user: walletAddress as `0x${string}`,
        amount: amountWei.toString(),
        deadline: deadline.toString(),
      } as any;

      // For MetaMask eth_signTypedData_v4: use numeric values for uint256 fields
      const messageForMetaMask = {
        user: walletAddress,
        amount: amountWei.toString(),
        deadline: deadline.toString(),
      };

      // Validate typed data structure
      try {
        hashTypedData({
          domain: domain as any,
          types: WITHDRAWAL_TYPES as any,
          primaryType: "Withdrawal" as any,
          message: messageBig as any,
        });
      } catch (e) {
        log.warn("DG withdraw: failed to compute client typed data hash", {
          e,
        });
      }

      // Determine wallet type for consistent message handling
      const maybeIsInjected =
        (wallet as any)?.connectorType === "injected" ||
        (wallet as any)?.walletClientType === "metamask" ||
        (typeof window !== "undefined" && (window as any).ethereum?.isMetaMask);

      let signature: string;

      if (isEmbedded) {
        // Sign with embedded wallet only; abort on user rejection
        try {
          const res = await signTypedData(
            {
              domain,
              types: WITHDRAWAL_TYPES as any,
              primaryType: "Withdrawal",
              message: messageStr,
            },
            { address: walletAddress }
          );
          signature = res.signature;
        } catch (e: any) {
          if (isUserRejectedError(e)) {
            throw new Error("Signature request cancelled");
          }
          throw e;
        }
      } else {
        // External wallet path
        // Prefer native MetaMask eth_signTypedData_v4 for injected MetaMask
        if (
          maybeIsInjected &&
          typeof window !== "undefined" &&
          (window as any).ethereum?.request
        ) {
          try {
            // Ensure selected injected account matches our target wallet
            const activeAccounts: string[] = await (
              window as any
            ).ethereum.request({ method: "eth_accounts" });
            const active = activeAccounts?.[0];
            if (
              !active ||
              active.toLowerCase() !== walletAddress.toLowerCase()
            ) {
              throw new Error(
                "Active wallet does not match selected address in app. Please switch account in MetaMask."
              );
            }

            // Use consistent BigInt structure to match server verification
            const typedData = JSON.stringify({
              domain,
              types: WITHDRAWAL_TYPES as any,
              primaryType: "Withdrawal",
              message: messageForMetaMask,
            });
            signature = await (window as any).ethereum.request({
              method: "eth_signTypedData_v4",
              params: [walletAddress, typedData],
            });
          } catch (e: any) {
            if (isUserRejectedError(e)) {
              throw new Error("Signature request cancelled");
            }
            // If provider is disconnected, surface a clear message
            const m = (e?.message || "").toString();
            if (m.includes("Disconnected from MetaMask background")) {
              throw new Error(
                "MetaMask disconnected. Reload the page and try again."
              );
            }
            // Fall through to viem
            try {
              const account = await toViemAccount({ wallet: wallet as any });
              const sigHex = await account.signTypedData({
                domain: domain as any,
                types: WITHDRAWAL_TYPES as any,
                primaryType: "Withdrawal" as any,
                message: messageBig as any,
              });
              signature = sigHex;
            } catch (eV: any) {
              if (isUserRejectedError(eV)) {
                throw new Error("Signature request cancelled");
              }
              // Finally try ethers fallback
              signature = await signWithdrawalMessage(
                walletAddress as `0x${string}`,
                amountDG,
                deadline,
                wallet,
                domain
              );
            }
          }
        } else {
          // Non-injected external wallet: viem first, ethers fallback
          try {
            const account = await toViemAccount({ wallet: wallet as any });
            const sigHex = await account.signTypedData({
              domain: domain as any,
              types: WITHDRAWAL_TYPES as any,
              primaryType: "Withdrawal" as any,
              message: messageBig as any,
            });
            signature = sigHex as unknown as string;
          } catch (e: any) {
            if (isUserRejectedError(e)) {
              throw new Error("Signature request cancelled");
            }
            signature = await signWithdrawalMessage(
              walletAddress as `0x${string}`,
              amountDG,
              deadline,
              wallet,
              domain
            );
          }
        }
      }

      // Verify signature with the same message structure used for signing
      let verificationMessage;
      if (isEmbedded) {
        verificationMessage = messageStr;
      } else if (maybeIsInjected) {
        verificationMessage = messageForMetaMask;
      } else {
        verificationMessage = messageBig;
      }

      try {
        const recovered = await recoverTypedDataAddress({
          domain: domain as any,
          types: WITHDRAWAL_TYPES as any,
          primaryType: "Withdrawal" as any,
          message: verificationMessage as any,
          signature: signature as `0x${string}`,
        });
        if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error(
            `Signature was produced by ${recovered}, but selected wallet is ${walletAddress}. Please switch account in your wallet and try again.`
          );
        }
      } catch (e: any) {
        if (isUserRejectedError(e)) throw e;
        // Surface any mismatch
        throw e instanceof Error ? e : new Error("Signature mismatch");
      }

      log.info("Withdrawal signature created", {
        amountDG,
        deadline: deadline.toString(),
      });

      // 3. Submit to API
      const response = await fetch("/api/token/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          amountDG,
          signature,
          deadline: Number(deadline),
          chainId,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Withdrawal failed");
      }

      setTxHash(data.transactionHash);
      log.info("Withdrawal successful", { txHash: data.transactionHash });

      return {
        success: true,
        txHash: data.transactionHash,
        withdrawalId: data.withdrawalId,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      log.error("Withdrawal failed", { error: err });
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    initiateWithdrawal,
    isLoading,
    error,
    txHash,
  };
}
