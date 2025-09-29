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

export const useAttestations = () => {
  const { wallets } = useWallets();
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
      const wallet = wallets[0];
      if (!wallet) {
        throw new Error("No wallet connected");
      }

      const result = await attestationService.createAttestation({
        ...request,
        wallet,
      });

      return result;
    } catch (error) {
      console.error("Error creating attestation:", error);
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
      const wallet = wallets[0];
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
      console.error("Error revoking attestation:", error);
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
    const wallet = wallets[0];
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
