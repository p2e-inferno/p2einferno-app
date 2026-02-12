/**
 * Main attestation hook for P2E Inferno
 * Provides core attestation functionality
 */

import { useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  AttestationService,
  AttestationResult,
  CreateAttestationParams,
} from "@/lib/attestation";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useAttestations");

export const useAttestations = () => {
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection();
  const [isLoading, setIsLoading] = useState(false);
  const attestationService = new AttestationService();

  /**
   * Create a new attestation
   */
  const createAttestation = async (
    request: Omit<CreateAttestationParams, "wallet">,
  ): Promise<AttestationResult> => {
    setIsLoading(true);
    try {
      const wallet = wallets.find(w => w.address === selectedWallet?.address) || wallets[0];
      if (!wallet) {
        throw new Error("No wallet connected");
      }

      const result = await attestationService.createAttestation({
        ...request,
        wallet,
      });

      return result;
    } catch (error) {
      log.error("Error creating attestation:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Revoke an existing attestation
   */
  const revokeAttestation = async (
    schemaUid: string,
    attestationUid: string,
  ): Promise<AttestationResult> => {
    setIsLoading(true);
    try {
      const wallet = wallets.find(w => w.address === selectedWallet?.address) || wallets[0];
      if (!wallet) {
        throw new Error("No wallet connected");
      }

      const result = await attestationService.revokeAttestation({
        schemaUid,
        attestationUid,
        wallet,
      });

      return result;
    } catch (error) {
      log.error("Error revoking attestation:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Get attestations for current user
   */
  const getUserAttestations = async (schemaUid?: string) => {
    const wallet = wallets.find(w => w.address === selectedWallet?.address) || wallets[0];
    if (!wallet?.address) {
      return [];
    }

    return await attestationService.getAttestations(wallet.address, schemaUid);
  };

  return {
    createAttestation,
    revokeAttestation,
    getUserAttestations,
    isLoading,
  };
};
