/**
 * Component: CryptoRenewalModal
 * Modal for crypto-based subscription purchase and renewal
 */

"use client";

import { useState } from "react";
import { X, Loader, CheckCircle, AlertCircle } from "lucide-react";
import { useKeyPurchase } from "@/hooks/unlock/useKeyPurchase";
import { useExtendKey } from "@/hooks/unlock/useExtendKey";
import { useDGNationKey } from "@/hooks/useDGNationKey";
import { useLockInfo } from "@/hooks/unlock/useLockInfo";

interface Props {
  mode: "purchase" | "renewal";
  onClose: () => void;
  onSuccess: () => void;
}

export const CryptoRenewalModal = ({ mode, onClose, onSuccess }: Props) => {
  const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;

  const [step, setStep] = useState<
    "confirm" | "confirming" | "success" | "error"
  >("confirm");
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    newExpiration: string;
    txHash?: string;
  } | null>(null);

  // Hooks for blockchain operations
  const { purchaseKey, isLoading: isPurchasing } = useKeyPurchase();
  const { extendKey, isLoading: isExtending } = useExtendKey();
  const { expirationTimestamp: currentExpiration, hasValidKey, tokenId } = useDGNationKey();
  const lockInfo = useLockInfo(lockAddress);

  const isLoading = isPurchasing || isExtending;

  const handleAction = async () => {
    if (!lockAddress) {
      setError("Lock address not configured");
      setStep("error");
      return;
    }

    setStep("confirming");
    setError(null);

    try {
      let result;
      let newExpiration: Date;

      if (mode === "purchase") {
        // Initial purchase - hook fetches price automatically
        result = await purchaseKey({
          lockAddress,
          // Hook uses smart defaults: recipient=current user, keyManager=recipient
        });

        if (!result.success) {
          throw new Error(result.error || "Purchase failed");
        }

        // Calculate expiration (30 days from now)
        newExpiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      } else {
        // Renewal - extend existing key
        if (!hasValidKey) {
          throw new Error("No valid key found to extend");
        }

        if (!tokenId) {
          throw new Error("Token ID not found");
        }

        if (!lockInfo.keyPriceRaw || lockInfo.keyPriceRaw === 0n) {
          throw new Error("Failed to fetch key price");
        }

        result = await extendKey({
          lockAddress,
          tokenId,
          value: lockInfo.keyPriceRaw,
        });

        if (!result.success) {
          throw new Error(result.error || "Extension failed");
        }

        // Calculate new expiration from current + 30 days
        const currentExp = currentExpiration ? Number(currentExpiration) : Math.floor(Date.now() / 1000);
        newExpiration = new Date((currentExp + 30 * 24 * 60 * 60) * 1000);
      }

      setSuccessData({
        newExpiration: newExpiration.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        txHash: result.transactionHash,
      });
      setStep("success");

    } catch (err: any) {
      setError(err.message || `Failed to ${mode === "purchase" ? "purchase" : "renew"} subscription`);
      setStep("error");
    }
  };

  const handleRetry = async () => {
    handleAction();
  };

  // Success state
  if (step === "success" && successData) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>

          <h3 className="font-bold text-lg text-center mt-4 text-white">
            {mode === "purchase" ? "Membership Activated!" : "Subscription Renewed!"}
          </h3>

          <div className="mt-4 p-4 bg-green-900/20 rounded-lg border border-green-500/30">
            <p className="text-sm text-green-300">
              <span className="font-semibold">New Expiration:</span>
              <br />
              {successData.newExpiration}
            </p>
          </div>

          {successData.txHash && (
            <div className="mt-3 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
              <p className="text-xs text-blue-300 break-all font-mono">
                {successData.txHash}
              </p>
            </div>
          )}

          <div className="mt-6">
            <button
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              onClick={() => {
                onSuccess();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Confirming state
  if (step === "confirming" && isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
          <div className="flex justify-center">
            <Loader className="animate-spin w-8 h-8 text-blue-500" />
          </div>
          <h3 className="font-bold text-lg text-center mt-4 text-white">
            {mode === "purchase" ? "Processing Purchase..." : "Processing Renewal..."}
          </h3>
          <p className="text-sm text-gray-400 text-center mt-2">
            Please confirm the transaction in your wallet and wait for confirmation.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (step === "error" && error) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 max-h-[60vh] flex flex-col">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h3 className="font-bold text-lg text-white">
              {mode === "purchase" ? "Purchase Failed" : "Renewal Failed"}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>

            <div className="mt-4 p-4 bg-red-900/20 rounded-lg border border-red-500/30">
              <p className="text-sm text-red-300 break-words">{error}</p>
            </div>
          </div>

          <div className="mt-6 flex gap-2 flex-shrink-0">
            <button
              className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              onClick={onClose}
            >
              Close
            </button>
            <button
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              onClick={handleRetry}
              disabled={isLoading}
            >
              {isLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main confirmation view
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="font-bold text-lg text-white">
            {mode === "purchase" ? "Purchase Membership" : "Renew Membership"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Loading state */}
          {lockInfo.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader className="animate-spin w-6 h-6 text-blue-500" />
              <span className="ml-2 text-gray-400">Loading price...</span>
            </div>
          )}

          {/* Error state */}
          {lockInfo.error && !lockInfo.isLoading && (
            <div className="p-4 bg-red-900/20 rounded-lg border border-red-500/30 mb-4">
              <p className="text-sm text-red-300">{lockInfo.error}</p>
            </div>
          )}

          {/* Price info */}
          {!lockInfo.isLoading && !lockInfo.error && (
            <>
              <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Duration</span>
                  <span className="text-white font-semibold">1 Month (30 days)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Price</span>
                  <span className="text-white font-semibold text-lg">
                    {lockInfo.keyPrice} {lockInfo.tokenSymbol}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-500/30 mb-4">
                <p className="text-sm text-blue-300">
                  {mode === "purchase"
                    ? "You'll receive a 30-day DG Nation membership key. You can renew it anytime before expiration."
                    : "Your membership will be extended by 30 days from the current expiration date."}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 flex-shrink-0">
          <button
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAction}
            disabled={lockInfo.isLoading || !!lockInfo.error || isLoading}
          >
            {isLoading ? "Processing..." : mode === "purchase" ? "Purchase Now" : "Renew Now"}
          </button>
        </div>
      </div>
    </div>
  );
};
