/**
 * AccessRequirementCard Component
 *
 * Displays information about DG Nation membership requirement.
 * Shows purchase button if user doesn't have access.
 */

import React, { useState } from "react";
import { useDGNationKey } from "@/hooks/useDGNationKey";
import { useKeyPurchase } from "@/hooks/unlock/useKeyPurchase";

export function AccessRequirementCard() {
  const { hasValidKey, isLoading: isLoadingKey } = useDGNationKey();
  const { purchaseKey, isLoading: isPurchasing } = useKeyPurchase();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (isLoadingKey || hasValidKey || isSuccess) {
    return null; // Don't show if loading, user already has access, or purchase was successful
  }

  const handlePurchase = async () => {
    try {
      setError(null);
      const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS;

      if (!lockAddress) {
        setError("Lock address not configured");
        return;
      }

      const result = await purchaseKey({
        lockAddress: lockAddress as `0x${string}`,
        // The useKeyPurchase hook will handle recipients, keyManagers, and referrers
        // with smart defaults (recipient = current user, etc.)
      });

      if (result.success) {
        setIsSuccess(true);
        // Optionally trigger a refresh of the key status
        setTimeout(() => window.location.reload(), 3000);
      } else {
        setError(result.error || "Purchase failed");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during purchase");
    }
  };

  return (
    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h3 className="font-medium text-blue-900">
        DG Nation Membership Required
      </h3>
      <p className="mt-1 text-sm text-blue-700">
        You need an active DG Nation membership NFT to pull out DG tokens. This
        is a recurring subscription NFT that provides access to exclusive
        features.
      </p>

      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-md">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handlePurchase}
          disabled={isPurchasing}
          className={`inline-flex items-center px-3 py-1.5 border border-blue-600 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isPurchasing ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Purchasing...
            </>
          ) : (
            "Purchase Membership"
          )}
        </button>

        <a
          href="https://app.unlock-protocol.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-1.5 border border-blue-500 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
        >
          Learn More
          <svg
            className="ml-1 -mr-0.5 h-4 w-4"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
