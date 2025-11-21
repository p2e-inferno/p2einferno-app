"use client";

import { usePrivy, useUser } from "@privy-io/react-auth";
import { useGoodDollarVerification } from "@/hooks/useGoodDollarVerification";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { FaceVerificationButton } from "./FaceVerificationButton";
import { CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

/**
 * Component to display GoodDollar face verification status
 * Shows verification badge if verified, or call-to-action if not
 *
 * Wallet / user detection:
 * - Uses Privy auth as the source of truth for user state
 * - Uses useDetectConnectedWalletAddress to determine the active wallet
 *   (aligned with PrivyConnectButton + admin auth patterns)
 */
export function VerificationStatus() {
  const { ready, authenticated } = usePrivy();
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const { data: status, isLoading } = useGoodDollarVerification();

  // Align with global auth / wallet detection:
  // - Only show verification status when Privy is ready and user is authenticated
  // - Require an active wallet detected via the shared hook
  if (!ready || !authenticated || !walletAddress) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 size={20} className="animate-spin" />
        <span>Checking verification status...</span>
      </div>
    );
  }

  // Verified and not expired
  if (status?.isWhitelisted && !status.needsReVerification) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle size={20} />
          <span className="font-medium">Verified with GoodDollar</span>
        </div>
        {status.expiresAt && (
          <span className="text-xs text-gray-400">
            Expires {format(new Date(status.expiresAt), "MMM d, yyyy")}
          </span>
        )}
      </div>
    );
  }

  // Needs re-verification
  if (status?.needsReVerification) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-yellow-500">
          <AlertCircle size={20} />
          <span className="font-medium">Verification Expired</span>
        </div>
        <p className="text-sm text-gray-300">
          Your face verification has expired. Please re-verify to maintain
          access.
        </p>
        <FaceVerificationButton className="w-full" variant="outline" />
      </div>
    );
  }

  // Not verified
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-gray-400">
        <Clock size={20} />
        <span className="font-medium">Verify Your Identity</span>
      </div>
      <p className="text-sm text-gray-300">
        Complete GoodDollar face verification to unlock full access.
      </p>
      <FaceVerificationButton className="w-full" />
    </div>
  );
}
