/**
 * Attestation Button Component
 * Reusable button for creating attestations with built-in loading and error handling
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { useAttestations } from "@/hooks/attestation";
import { hasUserAttestation } from "@/lib/attestation";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { getLogger } from "@/lib/utils/logger";
import { Loader2, Award, CheckCircle } from "lucide-react";

const log = getLogger("components:attestation:button");

interface AttestationButtonProps {
  schemaUid: string;
  recipient: string;
  data: Record<string, any>;
  children: React.ReactNode;
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  checkExisting?: boolean; // Whether to check if user already has this attestation
}

export const AttestationButton: React.FC<AttestationButtonProps> = ({
  schemaUid,
  recipient,
  data,
  children,
  onSuccess,
  onError,
  disabled = false,
  className = "",
  variant = "default",
  size = "default",
  checkExisting = true,
}) => {
  const { createAttestation, isLoading } = useAttestations();
  const wallet = useSmartWalletSelection();
  const [hasExistingAttestation, setHasExistingAttestation] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);

  // Check if user already has this attestation
  useEffect(() => {
    const checkExistingAttestation = async () => {
      if (!checkExisting || !wallet?.address || !schemaUid) return;

      setIsCheckingExisting(true);
      try {
        const exists = await hasUserAttestation(wallet.address, schemaUid);
        setHasExistingAttestation(exists);
      } catch (error) {
        log.error("Error checking existing attestation", { error });
      } finally {
        setIsCheckingExisting(false);
      }
    };

    checkExistingAttestation();
  }, [wallet?.address, schemaUid, checkExisting]);

  const handleAttestation = async () => {
    try {
      const result = await createAttestation({
        schemaUid,
        recipient,
        data,
        revocable: true,
      });

      if (result.success) {
        setHasExistingAttestation(true);
        toast.success("Attestation Created! 🎉\nYour attestation has been successfully recorded on-chain.");
        onSuccess?.(result);
      } else {
        throw new Error(result.error || "Failed to create attestation");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Attestation Failed\n${errorMessage}`);
      onError?.(errorMessage);
    }
  };

  const isButtonDisabled =
    disabled || isLoading || isCheckingExisting || hasExistingAttestation;

  const getButtonContent = () => {
    if (isCheckingExisting) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Checking...
        </>
      );
    }

    if (hasExistingAttestation) {
      return (
        <>
          <CheckCircle className="w-4 h-4 mr-2" />
          Already Attested
        </>
      );
    }

    if (isLoading) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Creating...
        </>
      );
    }

    return (
      <>
        <Award className="w-4 h-4 mr-2" />
        {children}
      </>
    );
  };

  return (
    <Button
      onClick={handleAttestation}
      disabled={isButtonDisabled}
      className={className}
      variant={hasExistingAttestation ? "secondary" : variant}
      size={size}
    >
      {getButtonContent()}
    </Button>
  );
};
