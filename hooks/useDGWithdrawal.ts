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
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";

const log = getLogger("hooks:useDGWithdrawal");

export interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  withdrawalId?: string;
  attestationScanUrl?: string | null;
  proofCancelled?: boolean;
  error?: string;
}

export type WithdrawalAuthorization = {
  walletAddress: string;
  chainId: number;
  signature: string;
  deadline: bigint;
};

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
  const { signAttestation } = useGaslessAttestation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const createWithdrawalAuthorization = async (
    amountDG: number,
  ): Promise<WithdrawalAuthorization> => {
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

    // Calculate deadline (15 minutes from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);

    const amountWei = BigInt(amountDG) * BigInt(10 ** 18);
    const messageBig: WithdrawalMessage = {
      user: walletAddress as `0x${string}`,
      amount: amountWei,
      deadline,
    };

    const messageStr = {
      user: walletAddress as `0x${string}`,
      amount: amountWei.toString(),
      deadline: deadline.toString(),
    } as any;

    const messageForMetaMask = {
      user: walletAddress,
      amount: amountWei.toString(),
      deadline: deadline.toString(),
    };

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

    const maybeIsInjected =
      (wallet as any)?.connectorType === "injected" ||
      (wallet as any)?.walletClientType === "metamask" ||
      (typeof window !== "undefined" && (window as any).ethereum?.isMetaMask);

    let signature: string;

    if (isEmbedded) {
      try {
        const res = await signTypedData(
          {
            domain,
            types: WITHDRAWAL_TYPES as any,
            primaryType: "Withdrawal",
            message: messageStr,
          },
          { address: walletAddress },
        );
        signature = res.signature;
      } catch (e: any) {
        if (isUserRejectedError(e)) {
          throw new Error("Signature request cancelled");
        }
        throw e;
      }
    } else {
      if (
        maybeIsInjected &&
        typeof window !== "undefined" &&
        (window as any).ethereum?.request
      ) {
        try {
          const activeAccounts: string[] = await (
            window as any
          ).ethereum.request({ method: "eth_accounts" });
          const active = activeAccounts?.[0];
          if (!active || active.toLowerCase() !== walletAddress.toLowerCase()) {
            throw new Error(
              "Active wallet does not match selected address in app. Please switch account in MetaMask.",
            );
          }

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
          const m = (e?.message || "").toString();
          if (m.includes("Disconnected from MetaMask background")) {
            throw new Error(
              "MetaMask disconnected. Reload the page and try again.",
            );
          }
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
            signature = await signWithdrawalMessage(
              walletAddress as `0x${string}`,
              amountDG,
              deadline,
              wallet,
              domain,
            );
          }
        }
      } else {
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
            domain,
          );
        }
      }
    }

    let verificationMessage;
    if (isEmbedded) {
      verificationMessage = messageStr;
    } else if (maybeIsInjected) {
      verificationMessage = messageForMetaMask;
    } else {
      verificationMessage = messageBig;
    }

    const recovered = await recoverTypedDataAddress({
      domain: domain as any,
      types: WITHDRAWAL_TYPES as any,
      primaryType: "Withdrawal" as any,
      message: verificationMessage as any,
      signature: signature as `0x${string}`,
    });
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error(
        `Signature was produced by ${recovered}, but selected wallet is ${walletAddress}. Please switch account in your wallet and try again.`,
      );
    }

    log.info("Withdrawal signature created", {
      amountDG,
      deadline: deadline.toString(),
    });

    return { walletAddress, chainId, signature, deadline };
  };

  const submitWithdrawal = async (params: {
    walletAddress: string;
    amountDG: number;
    signature: string;
    deadline: bigint;
    chainId: number;
  }) => {
    const response = await fetch("/api/token/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: params.walletAddress,
        amountDG: params.amountDG,
        signature: params.signature,
        deadline: Number(params.deadline),
        chainId: params.chainId,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Withdrawal failed");
    }
    return data as any;
  };

  const waitForWithdrawalConfirmation = async (transactionHash: string) => {
    const publicClient = createPublicClientUnified();
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash as `0x${string}`,
      confirmations: 1,
    });
    return { receipt };
  };

  const commitWithdrawalAttestation = async (params: {
    withdrawalId: string;
    walletAddress: string;
    amountDG: number;
    withdrawalTimestamp: number;
    withdrawalTxHash: string;
  }): Promise<{
    attestationScanUrl: string | null;
    proofCancelled: boolean;
  }> => {
    try {
      const signature = await signAttestation({
        schemaKey: "dg_withdrawal",
        recipient: params.walletAddress,
        schemaData: [
          { name: "userAddress", type: "address", value: params.walletAddress },
          { name: "amountDg", type: "uint256", value: BigInt(params.amountDG) },
          {
            name: "withdrawalTimestamp",
            type: "uint256",
            value: BigInt(params.withdrawalTimestamp),
          },
          {
            name: "withdrawalTxHash",
            type: "bytes32",
            value: params.withdrawalTxHash,
          },
        ],
      });

      const commitRes = await fetch("/api/token/withdraw/commit-attestation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalId: params.withdrawalId,
          attestationSignature: signature,
        }),
      });
      const commitJson = await commitRes.json().catch(() => ({}));
      return {
        attestationScanUrl: commitJson?.attestationScanUrl || null,
        proofCancelled: false,
      };
    } catch (e: any) {
      if (isUserRejectedError(e)) {
        return { attestationScanUrl: null, proofCancelled: true };
      }
      throw e;
    }
  };

  const initiateWithdrawal = async (
    amountDG: number,
  ): Promise<WithdrawalResult> => {
    try {
      setIsLoading(true);
      setError(null);
      setTxHash(null);

      const auth = await createWithdrawalAuthorization(amountDG);
      const data = await submitWithdrawal({
        walletAddress: auth.walletAddress,
        amountDG,
        signature: auth.signature,
        deadline: auth.deadline,
        chainId: auth.chainId,
      });

      setTxHash(data.transactionHash);
      log.info("Withdrawal successful", { txHash: data.transactionHash });

      let attestationScanUrl: string | null | undefined = null;
      let proofCancelled = false;

      if (isEASEnabled() && data.attestationRequired) {
        const payload = data?.attestationPayload;
        const amount = Number(payload?.amountDg ?? amountDG);
        const withdrawalTimestamp =
          payload?.withdrawalTimestamp ?? Math.floor(Date.now() / 1000);
        const withdrawalTxHash =
          payload?.withdrawalTxHash || data.transactionHash;

        const proof = await commitWithdrawalAttestation({
          withdrawalId: data.withdrawalId,
          walletAddress: auth.walletAddress,
          amountDG: amount,
          withdrawalTimestamp,
          withdrawalTxHash,
        });
        attestationScanUrl = proof.attestationScanUrl;
        proofCancelled = proof.proofCancelled;
      }

      return {
        success: true,
        txHash: data.transactionHash,
        withdrawalId: data.withdrawalId,
        attestationScanUrl,
        proofCancelled,
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
    createWithdrawalAuthorization,
    submitWithdrawal,
    waitForWithdrawalConfirmation,
    commitWithdrawalAttestation,
    isLoading,
    error,
    txHash,
  };
}
