import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { getLogger } from "@/lib/utils/logger";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { getClientConfig } from "@/lib/blockchain/config";

const log = getLogger("hooks:useAdminSignedAction");

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

export type AdminSignedActionPayload = {
  signature: `0x${string}`;
  nonce: string;
  timestamp: number;
  signerAddress: `0x${string}`;
};

export function useAdminSignedAction() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection() as {
    address?: string;
    connectorType?: string;
    walletClientType?: string;
  } | null;
  const writeWallet = usePrivyWriteWallet() as {
    address?: string;
    connectorType?: string;
    walletClientType?: string;
  } | null;
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const signAdminAction = async (
    message: AdminActionMessage,
  ): Promise<AdminSignedActionPayload> => {
    setError(null);
    setIsSigning(true);

    try {
      if (!user || !wallets || wallets.length === 0) {
        throw new Error("Wallet not connected");
      }

      const preferredAddress = selectedWallet?.address;
      if (!preferredAddress) {
        throw new Error(
          "Active wallet not selected. Please select a wallet in the admin UI.",
        );
      }

      // Find the wallet that matches the preferred (selected) address
      const matchedWallet =
        wallets.find(
          (candidate) =>
            candidate?.address?.toLowerCase() ===
            preferredAddress.toLowerCase(),
        ) || null;

      // Mirror useAdminApi: sign with the same selected wallet used for X-Active-Wallet.
      // Priority: matched wallet (from selectedWallet), then writeWallet, then first available
      const wallet = matchedWallet || writeWallet || wallets[0];

      if (!wallet?.address) {
        throw new Error(
          "Selected wallet is not available to sign. Please reconnect the wallet.",
        );
      }

      // EIP-712 Domain - uses number for chainId (same as server)
      const { chainId: appChainId } = getClientConfig();
      const domain = {
        name: "P2E Inferno Admin",
        version: "1",
        chainId: appChainId, // app-configured chainId; do not bind to target network
      };

      // EIP-712 Types - must match server exactly
      const types = {
        AdminAction: [
          { name: "action", type: "string" },
          { name: "network", type: "string" },
          { name: "schemaDefinitionHash", type: "bytes32" },
          { name: "schemaUid", type: "string" },
          { name: "transactionHash", type: "string" },
          { name: "timestamp", type: "uint256" },
          { name: "nonce", type: "string" },
        ],
      };

      // Message value - uses number for timestamp (same as server)
      const value = {
        action: message.action,
        network: message.network,
        schemaDefinitionHash: message.schemaDefinitionHash,
        schemaUid: message.schemaUid,
        transactionHash: message.transactionHash,
        timestamp: message.timestamp, // number, not bigint or string
        nonce: message.nonce,
      };

      // Use ethers for signing (same as TeeRex pattern and server verification)
      let signature: string;

      // Get Ethereum provider from Privy wallet
      const provider = await (wallet as any).getEthereumProvider();
      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      // Get actual signer address
      const actualSignerAddress = await signer.getAddress();

      try {
        // Sign using ethers.js (matches server's ethers.verifyTypedData)
        signature = await signer.signTypedData(domain, types, value);
      } catch (err: any) {
        if (isUserRejectedError(err)) {
          throw new Error("Signature request cancelled");
        }
        throw err;
      }

      return {
        signature: signature as `0x${string}`,
        nonce: message.nonce,
        timestamp: message.timestamp,
        signerAddress: actualSignerAddress.toLowerCase() as `0x${string}`,
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
