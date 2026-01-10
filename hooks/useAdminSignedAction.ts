import { useState } from "react";
import {
  usePrivy,
  useWallets,
  useSignTypedData,
  toViemAccount,
} from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { ensureCorrectNetwork } from "@/lib/blockchain/shared/network-utils";
import { resolveChainById } from "@/lib/blockchain/config/core/chain-map";
import { getClientRpcUrls } from "@/lib/blockchain/config";

const log = getLogger("hooks:useAdminSignedAction");

const ADMIN_ACTION_TYPES = {
  AdminAction: [
    { name: "action", type: "string" },
    { name: "network", type: "string" },
    { name: "schemaDefinitionHash", type: "bytes32" },
    { name: "schemaUid", type: "string" },
    { name: "transactionHash", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "nonce", type: "string" },
  ],
} as const;

const isUserRejectedError = (err: any): boolean => {
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
};

export const isSignatureRequestCancelled = (err: unknown): boolean => {
  const anyErr = err as any;
  const msg = (anyErr?.message || anyErr?.toString?.() || "")
    .toString()
    .toLowerCase();
  return (
    isUserRejectedError(anyErr) ||
    msg.includes("signature request cancelled") ||
    msg.includes("signature request canceled") ||
    msg.includes("user rejected") ||
    msg.includes("rejected") ||
    msg.includes("denied") ||
    msg.includes("cancel") ||
    msg.includes("canceled") ||
    msg.includes("cancelled")
  );
};

export type AdminActionMessage = {
  action: string;
  network: string;
  schemaDefinitionHash: `0x${string}`;
  schemaUid: string;
  transactionHash: string;
  timestamp: number;
  nonce: string;
};

export function useAdminSignedAction() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection() as
    | { address?: string; connectorType?: string; walletClientType?: string }
    | null;
  const writeWallet = usePrivyWriteWallet() as
    | { address?: string; connectorType?: string; walletClientType?: string }
    | null;
  const { signTypedData } = useSignTypedData();
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const signAdminAction = async (
    message: AdminActionMessage,
    chainId: number,
  ): Promise<{ signature: `0x${string}`; nonce: string; timestamp: number }> => {
    setError(null);
    setIsSigning(true);

    try {
      if (!user || !wallets || wallets.length === 0) {
        throw new Error("Wallet not connected");
      }

      const preferredAddress = selectedWallet?.address;
      const matchedWallet =
        (preferredAddress
          ? wallets.find(
              (candidate) =>
                candidate?.address?.toLowerCase() ===
                preferredAddress.toLowerCase(),
            )
          : null) || null;

      const wallet = writeWallet || matchedWallet || wallets[0];

      if (!wallet?.address) {
        throw new Error("Wallet address not available");
      }

      const domain = {
        name: "P2E Inferno Admin",
        version: "1",
        chainId: chainId,
      } as const;

      const messageWithTimestamp = {
        ...message,
        timestamp: message.timestamp,
      };

      let signature: string;
      const walletAddress = wallet.address;
      const isEmbedded = (wallet as any)?.walletClientType === "privy";
      const selectedIsInjected =
        selectedWallet?.connectorType === "injected" ||
        selectedWallet?.walletClientType === "metamask";
      const maybeIsInjected =
        selectedIsInjected ||
        (wallet as any)?.connectorType === "injected" ||
        (wallet as any)?.walletClientType === "metamask" ||
        (typeof window !== "undefined" && (window as any).ethereum?.isMetaMask);

      if (isEmbedded) {
        try {
          const res = await signTypedData(
            {
              domain,
              types: ADMIN_ACTION_TYPES as any,
              primaryType: "AdminAction",
              message: messageWithTimestamp as any,
            },
            { address: walletAddress },
          );
          signature = res.signature;
        } catch (err: any) {
          if (isUserRejectedError(err)) {
            throw new Error("Signature request cancelled");
          }
          throw err;
        }
      } else if (
        maybeIsInjected &&
        typeof window !== "undefined" &&
        (window as any).ethereum?.request
      ) {
        try {
          const chain = resolveChainById(chainId);
          const [rpcUrl] = getClientRpcUrls(chainId);
          if (chain && rpcUrl) {
            await ensureCorrectNetwork((window as any).ethereum, {
              chain,
              rpcUrl,
              networkName: chain.name,
            });
          }

          const targetAddress = selectedWallet?.address || walletAddress;
          const activeAccounts: string[] = await (window as any).ethereum.request({
            method: "eth_accounts",
          });
          const active = activeAccounts?.[0];
          if (!active || active.toLowerCase() !== targetAddress.toLowerCase()) {
            throw new Error(
              "Active wallet does not match selected address in app. Please switch account in MetaMask.",
            );
          }

          const messageForMetaMask = {
            ...messageWithTimestamp,
            timestamp: message.timestamp.toString(),
          };

          const typedData = JSON.stringify({
            domain,
            types: ADMIN_ACTION_TYPES as any,
            primaryType: "AdminAction",
            message: messageForMetaMask,
          });

          signature = await (window as any).ethereum.request({
            method: "eth_signTypedData_v4",
            params: [targetAddress, typedData],
          });
        } catch (err: any) {
          if (isUserRejectedError(err)) {
            throw new Error("Signature request cancelled");
          }
          const msg = (err?.message || "").toString();
          if (msg.includes("Disconnected from MetaMask background")) {
            throw new Error("MetaMask disconnected. Reload the page and try again.");
          }
          const account = await toViemAccount({ wallet: wallet as any });
          signature = await account.signTypedData({
            domain: domain as any,
            types: ADMIN_ACTION_TYPES as any,
            primaryType: "AdminAction" as any,
            message: {
              ...message,
              timestamp: BigInt(message.timestamp),
            } as any,
          });
        }
      } else {
        try {
          const account = await toViemAccount({ wallet: wallet as any });
          signature = await account.signTypedData({
            domain: domain as any,
            types: ADMIN_ACTION_TYPES as any,
            primaryType: "AdminAction" as any,
            message: {
              ...message,
              timestamp: BigInt(message.timestamp),
            } as any,
          });
        } catch (err: any) {
          if (isUserRejectedError(err)) {
            throw new Error("Signature request cancelled");
          }
          throw err;
        }
      }

      return {
        signature: signature as `0x${string}`,
        nonce: message.nonce,
        timestamp: message.timestamp,
      };
    } catch (err: any) {
      const msg = err?.message || "Failed to sign admin action";
      log.warn("Admin action signing failed", { error: msg });
      setError(msg);
      throw err;
    } finally {
      setIsSigning(false);
    }
  };

  return { signAdminAction, isSigning, error };
}
