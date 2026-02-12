/**
 * Hook for signing delegated check-in attestations using EAS SDK
 *
 * This follows TeeRex's gasless attestation pattern where:
 * - User signs an EIP-712 message using EAS SDK (no gas cost, no transaction)
 * - EAS SDK handles the correct domain construction automatically
 * - Server wallet submits the transaction and pays gas
 * - Real attestation UID is extracted from on-chain event
 *
 * Implementation matches TeeRex's useDelegatedAttestation.ts (EAS SDK approach)
 */

import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { ethers } from "ethers";
import { EAS } from "@ethereum-attestation-service/eas-sdk";
import {
  resolveNetworkConfig,
  getDefaultNetworkName,
} from "@/lib/attestation/core/network-config";
import { getLogger } from "@/lib/utils/logger";
import { useState } from "react";
import { ensureWalletOnChainId } from "@/lib/blockchain/shared/ensure-wallet-network";

const log = getLogger("hooks:useDelegatedAttestationCheckin");

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

export interface DelegatedAttestationCheckinSignature {
  signature: string; // 0x rsv format
  deadline: bigint;
  attester: string; // user's address (signer)
  recipient: string;
  schemaUid: string;
  data: string;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  chainId: number;
  network: string;
}

export const useDelegatedAttestationCheckin = () => {
  const selectedWallet = useSmartWalletSelection();
  const [isSigning, setIsSigning] = useState(false);

  const signCheckinAttestation = async (params: {
    schemaUid: string;
    recipient: string;
    data: string; // 0x encoded attestation data
    deadlineSecondsFromNow?: number;
    network?: string;
    expirationTime?: bigint;
    revocable?: boolean;
    refUID?: string;
  }): Promise<DelegatedAttestationCheckinSignature> => {
    if (!selectedWallet) {
      throw new Error("No wallet connected");
    }

    setIsSigning(true);

    try {
      // Get network config to determine chainId and EAS contract address
      const networkName = params.network || getDefaultNetworkName();
      const networkConfig = await resolveNetworkConfig(networkName);

      if (!networkConfig) {
        throw new Error(`Network ${networkName} not configured`);
      }

      const chainId = networkConfig.chainId;
      const easContractAddress = networkConfig.easContractAddress;

      log.debug("Signing delegated check-in attestation", {
        schemaUid: params.schemaUid,
        recipient: params.recipient,
        network: networkName,
        chainId,
      });

      // Get ethers provider from Privy wallet
      const provider = await (selectedWallet as any).getEthereumProvider();
      if (!provider) {
        throw new Error("Failed to get Ethereum provider from wallet");
      }

      try {
        await ensureWalletOnChainId(provider, {
          chainId,
          rpcUrl: networkConfig.rpcUrl,
          networkName: networkConfig.displayName,
        });
      } catch (err: any) {
        if (isUserRejectedError(err)) {
          throw new Error("Network switch cancelled");
        }
        throw err;
      }

      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + (params.deadlineSecondsFromNow ?? 3600),
      );
      const attester = await signer.getAddress();
      const expirationTime = params.expirationTime ?? 0n;
      const revocable = params.revocable ?? false;
      const refUID =
        params.refUID ??
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      // Initialize EAS SDK
      const eas = new EAS(easContractAddress);
      eas.connect(signer);

      // Get delegated interface
      const delegated = await eas.getDelegated();

      // Sign delegated attestation using EAS SDK
      // This handles the correct EIP-712 domain automatically
      const response = await delegated.signDelegatedAttestation(
        {
          schema: params.schemaUid,
          recipient: params.recipient,
          expirationTime,
          revocable,
          refUID,
          data: params.data,
          deadline,
          value: 0n,
        },
        signer,
      );

      // Normalize signature to 0x rsv string format
      let signature: string;
      if (typeof response.signature === "string") {
        signature = response.signature;
      } else if (
        typeof response.signature === "object" &&
        "v" in response.signature &&
        "r" in response.signature &&
        "s" in response.signature
      ) {
        // Convert {v, r, s} to 0x rsv format
        const sig = ethers.Signature.from(response.signature as any);
        signature = sig.serialized;
      } else {
        throw new Error("Unexpected signature format from EAS SDK");
      }

      log.info("Successfully signed delegated check-in attestation", {
        attester,
        recipient: params.recipient,
        network: networkName,
      });

      return {
        signature,
        deadline,
        attester,
        recipient: params.recipient,
        schemaUid: params.schemaUid,
        data: params.data,
        expirationTime,
        revocable,
        refUID,
        chainId,
        network: networkName,
      };
    } catch (error) {
      log.error("Failed to sign delegated check-in attestation", { error });
      throw error;
    } finally {
      setIsSigning(false);
    }
  };

  return { signCheckinAttestation, isSigning };
};
