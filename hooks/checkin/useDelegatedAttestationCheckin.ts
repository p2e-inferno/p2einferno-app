/**
 * Hook for signing delegated check-in attestations using EAS native delegated attestation
 *
 * This follows TeeRex's gasless attestation pattern where:
 * - User signs an EIP-712 message (no gas cost, no transaction)
 * - Server wallet submits the transaction and pays gas
 * - Real attestation UID is extracted from on-chain event
 *
 * Adapted from TeeRex's useTeeRexDelegatedAttestation.ts to P2E Inferno's patterns
 */

import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import {
  resolveNetworkConfig,
  getDefaultNetworkName,
} from "@/lib/attestation/core/network-config";
import { getLogger } from "@/lib/utils/logger";
import { useState } from "react";

const log = getLogger("hooks:useDelegatedAttestationCheckin");

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
  const { wallets } = useWallets();
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
    const wallet = wallets?.[0];
    if (!wallet) {
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
      const provider = await (wallet as any).getEthereumProvider();
      if (!provider) {
        throw new Error("Failed to get Ethereum provider from wallet");
      }

      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + (params.deadlineSecondsFromNow ?? 3600)
      );
      const attester = await signer.getAddress();
      const expirationTime = params.expirationTime ?? 0n;
      const revocable = params.revocable ?? false;
      const refUID =
        params.refUID ??
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      // EIP-712 domain for P2E Inferno (custom domain, not EAS SDK domain)
      // This follows TeeRex's pattern of using a custom domain
      const domain = {
        name: "P2E Inferno",
        version: "1.0.0",
        chainId,
        verifyingContract: easContractAddress,
      };

      // EIP-712 type structure for EAS attestByDelegation
      // This must match the EAS contract's ATTEST_TYPEHASH
      const types = {
        Attest: [
          { name: "schema", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "expirationTime", type: "uint64" },
          { name: "revocable", type: "bool" },
          { name: "refUID", type: "bytes32" },
          { name: "data", type: "bytes" },
          { name: "value", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      };

      const value = {
        schema: params.schemaUid,
        recipient: params.recipient,
        expirationTime,
        revocable,
        refUID,
        data: params.data,
        value: 0n,
        deadline,
      };

      // Sign using ethers.js (same pattern as admin signed actions)
      const signature = await signer.signTypedData(domain, types, value);

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
