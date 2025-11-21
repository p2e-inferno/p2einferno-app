"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useIdentitySDK } from "@/lib/gooddollar/use-identity-sdk";
import { generateFVLink } from "@/lib/gooddollar/generate-fv-link";
import { getDisplayNameSync } from "@/lib/gooddollar/get-display-name";
import { Button } from "@/components/ui/button";
import { getLogger } from "@/lib/utils/logger";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { useState } from "react";
import toast from "react-hot-toast";

const log = getLogger("component:face-verification-button");

interface FaceVerificationButtonProps {
  onVerified?: () => void;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

/**
 * Button component to initiate GoodDollar face verification flow
 * Generates verification link and redirects user to face verification
 */
export function FaceVerificationButton({
  onVerified,
  className,
  variant = "default",
  size = "default",
}: FaceVerificationButtonProps) {
  void onVerified;
  const { user } = usePrivy();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const sdk = useIdentitySDK();
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    try {
      if (!sdk) {
        toast.error("SDK not initialized. Please refresh and try again.");
        log.error("SDK not initialized");
        return;
      }

      if (!walletAddress) {
        toast.error("Please connect your wallet first");
        return;
      }

      if (!user) {
        toast.error("Please authenticate first");
        return;
      }

      setIsLoading(true);

      // Get display name (SDK signs this, so it's used for identity verification)
      const displayName = getDisplayNameSync(user);
      log.info("Initiating face verification", {
        displayName,
        address: walletAddress,
      });

      // Generate FV link
      const callbackUrl = `${window.location.origin}/api/gooddollar/verify-callback`;
      const fvLink = await generateFVLink({
        sdk,
        callbackUrl,
        popupMode: false,
      });

      log.info("FV link generated, redirecting", { fvLink });
      window.location.href = fvLink;
    } catch (error) {
      log.error("Failed to initiate face verification", { error });
      toast.error("Failed to initiate face verification. Please try again.");
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || !sdk || !walletAddress || !user;

  return (
    <Button
      onClick={handleVerify}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? "Loading..." : "Verify Your Identity"}
    </Button>
  );
}
