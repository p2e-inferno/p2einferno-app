"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useIdentitySDK } from "@/lib/gooddollar/use-identity-sdk";
import { generateFVLink } from "@/lib/gooddollar/generate-fv-link";
import { getDisplayNameSync } from "@/lib/gooddollar/get-display-name";
import { Button } from "@/components/ui/button";
import { getLogger } from "@/lib/utils/logger";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowRight } from "lucide-react";

const log = getLogger("component:face-verification-button");

interface FaceVerificationButtonProps {
  onVerified?: () => void;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function useFaceVerificationAction(onVerified?: () => void) {
  const { user } = usePrivy();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const { sdk } = useIdentitySDK();
  const [isLoading, setIsLoading] = useState(false);

  const isDisabled = isLoading || !sdk || !walletAddress || !user;

  // Handle bfcache restoration (when user navigates back)
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        log.info("Restored from bfcache, resetting loading state");
        setIsLoading(false);
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handleVerify = useCallback(async () => {
    log.info("Starting face verification", { walletAddress });

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

      // Get display name for face verification UI
      const displayName = getDisplayNameSync(user);
      log.info("Initiating gooddollar verification", {
        displayName,
        address: walletAddress,
      });

      // Generate FV link (send users back to the client callback page)
      const callbackUrl = new URL(
        "/gooddollar/verify-callback",
        window.location.origin,
      );
      callbackUrl.searchParams.set("wallet", walletAddress);
      try {
        const currentUrl = window.location.href;
        window.sessionStorage.setItem("gooddollar:returnUrl", currentUrl);
      } catch (storageError) {
        log.warn("Failed to persist return URL", { storageError });
      }
      const fvLink = await generateFVLink({
        sdk,
        callbackUrl: callbackUrl.toString(),
        popupMode: false,
      });

      log.info("FV link generated, redirecting", { fvLink });
      if (onVerified) {
        onVerified();
      }
      window.location.href = fvLink;
    } catch (error) {
      log.error("Failed to initiate gooddollar verification", { error });
      toast.error(
        "Failed to initiate gooddollar verification. Please try again.",
      );
      setIsLoading(false);
    }
  }, [sdk, walletAddress, user, onVerified]);

  return { handleVerify, isLoading, isDisabled };
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
  const { handleVerify, isLoading, isDisabled } =
    useFaceVerificationAction(onVerified);

  return (
    <Button
      onClick={handleVerify}
      disabled={isDisabled}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? (
        "Loading..."
      ) : (
        <>
          <span>Verify</span>
          <ArrowRight
            size={20}
            className="group-hover:translate-x-1 transition-transform"
          />
        </>
      )}
    </Button>
  );
}
