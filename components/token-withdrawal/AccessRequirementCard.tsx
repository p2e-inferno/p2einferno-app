/**
 * AccessRequirementCard Component
 *
 * Displays information about DG Nation membership requirement.
 * Shows purchase button if user doesn't have access.
 */

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader, CheckCircle, AlertCircle } from "lucide-react";
import { useDGNationKey } from "@/hooks/useDGNationKey";
import { useKeyPurchase } from "@/hooks/unlock/useKeyPurchase";
import { LockPriceDisplay } from "@/components/subscription/LockPriceDisplay";
import { useLockInfo } from "@/hooks/unlock/useLockInfo";
import { formatWalletAddress } from "@/lib/utils/wallet-address";

/**
 * Displays a card prompting the user to obtain a DG Nation membership when membership is required for access.
 *
 * The card opens a purchase confirmation modal where pricing is shown and the user can initiate a membership purchase.
 * The modal surfaces lock info, errors, and success feedback. On a successful purchase the component will trigger a page
 * reload after a short delay to refresh access state.
 *
 * @returns The card and optional purchase modal UI, or `null` when the component is not rendered (e.g., while access status is loading, the user already has a valid key, or a recent purchase succeeded).
 */
export function AccessRequirementCard() {
  const router = useRouter();
  const lockAddress = process.env
    .NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;

  const {
    hasValidKey,
    hasValidKeyAnyLinked,
    validWalletAddress,
    isLoading: isLoadingKey,
  } = useDGNationKey();
  const { purchaseKey, isLoading: isPurchasing } = useKeyPurchase();
  const lockInfo = useLockInfo(lockAddress);

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showPurchaseModal) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPurchasing) {
        setShowPurchaseModal(false);
        setError(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showPurchaseModal, isPurchasing]);

  if (isLoadingKey || hasValidKey || (isSuccess && !showPurchaseModal)) {
    return null; // Don't show if loading, user already has access, or purchase was successful
  }

  if (hasValidKeyAnyLinked && validWalletAddress) {
    return (
      <div className="p-6 bg-gradient-to-br from-indigo-500/10 via-transparent to-orange-500/5 border border-indigo-500/20 rounded-2xl relative overflow-hidden backdrop-blur-sm">
        <div className="relative z-10">
          <h3 className="text-lg font-black text-white mb-2 tracking-tight uppercase">
            Membership Found on Another Wallet
          </h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-2 max-w-md">
            Your DG Nation membership exists on{" "}
            <span className="font-mono text-gray-200">
              {formatWalletAddress(validWalletAddress)}
            </span>
            . You don&apos;t need to purchase another membership.
          </p>
          <p className="text-gray-500 text-xs leading-relaxed max-w-md">
            Withdrawals are gated per-user across linked wallets, but purchases
            should be avoided to prevent duplicate memberships.
          </p>
        </div>
      </div>
    );
  }

  const handleOpenPurchaseModal = () => {
    setShowPurchaseModal(true);
  };

  const handleConfirmPurchase = async () => {
    try {
      setError(null);

      if (!lockAddress) {
        setError("Lock address not configured");
        return;
      }

      // Guard: Ensure React Query has loaded the lock info
      // Once loaded, any price (including 0n for free locks) is legitimate
      if (lockInfo.isLoading) {
        setError("Loading lock information, please wait...");
        return;
      }

      if (lockInfo.error) {
        setError(lockInfo.error);
        return;
      }

      const result = await purchaseKey({
        lockAddress: lockAddress as `0x${string}`,
        // The useKeyPurchase hook will handle recipients, keyManagers, and referrers
        // with smart defaults (recipient = current user, etc.)
      });

      if (result.success) {
        setIsSuccess(true);
        // Delay closing modal so success UI is visible
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        refreshTimeoutRef.current = setTimeout(() => {
          setShowPurchaseModal(false);
          // Trigger Next.js data refresh without full page reload
          router.refresh();
          refreshTimeoutRef.current = null;
        }, 2000);
      } else {
        setError(result.error || "Purchase failed");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred during purchase";
      setError(message);
    }
  };

  return (
    <>
      <div className="p-6 bg-gradient-to-br from-indigo-500/10 via-transparent to-orange-500/5 border border-indigo-500/20 rounded-2xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <AlertCircle
            aria-hidden="true"
            focusable="false"
            role="presentation"
            className="w-24 h-24 text-indigo-400 rotate-12"
          />
        </div>

        <div className="relative z-10">
          <h3 className="text-lg font-black text-white mb-2 tracking-tight uppercase">
            DG Nation Membership Required
          </h3>
          <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-md">
            You need an active DG Nation membership NFT to pull out DG tokens.
            This is a recurring subscription NFT that provides access to
            exclusive features.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleOpenPurchaseModal}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
            >
              View Pricing & Purchase
            </button>
          </div>
        </div>
      </div>

      {/* Purchase Confirmation Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-modal-title"
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 max-h-[60vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3
                id="purchase-modal-title"
                className="font-bold text-lg text-white"
              >
                Purchase Membership
              </h3>
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setError(null);
                }}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                disabled={isPurchasing}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {/* Price Display */}
              <LockPriceDisplay lockAddress={lockAddress} className="mb-4" />

              {/* Info message */}
              {!lockInfo.isLoading && !lockInfo.error && (
                <div className="p-4 bg-blue-900/20 rounded-lg border border-blue-500/30 mb-4">
                  <p className="text-sm text-blue-300">
                    You&apos;ll receive a {lockInfo.durationFormatted} DG Nation
                    membership key. You can renew it anytime before expiration.
                  </p>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-4 bg-red-900/20 rounded-lg border border-red-500/30 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="text-sm text-red-300 break-words">{error}</p>
                </div>
              )}

              {/* Success Display */}
              {isSuccess && (
                <div className="p-4 bg-green-900/20 rounded-lg border border-green-500/30 mb-4">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-sm text-green-300 text-center">
                    Purchase successful! Page will reload shortly...
                  </p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-4 flex-shrink-0">
              <button
                className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => {
                  setShowPurchaseModal(false);
                  setError(null);
                }}
                disabled={isPurchasing}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleConfirmPurchase}
                disabled={
                  lockInfo.isLoading ||
                  !!lockInfo.error ||
                  isPurchasing ||
                  isSuccess
                }
              >
                {isPurchasing ? (
                  <>
                    <Loader className="inline-block animate-spin w-4 h-4 mr-2" />
                    Processing...
                  </>
                ) : (
                  "Purchase Now"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
