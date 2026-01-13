/**
 * LockPriceDisplay Component
 *
 * Reusable component for displaying lock pricing information
 * Shows token symbol, amount, and duration in a consistent format
 * Handles loading and error states
 * Fetches duration dynamically from the contract
 */

"use client";

import { Loader } from "lucide-react";
import { useLockInfo } from "@/hooks/unlock/useLockInfo";

interface LockPriceDisplayProps {
  lockAddress: string | undefined;
  className?: string;
}

export const LockPriceDisplay = ({
  lockAddress,
  className = "",
}: LockPriceDisplayProps) => {
  const lockInfo = useLockInfo(lockAddress);

  // Loading state
  if (lockInfo.isLoading) {
    return (
      <div
        className={`p-4 bg-gray-800 rounded-lg border border-gray-700 ${className}`}
      >
        <div className="flex items-center justify-center py-4">
          <Loader className="animate-spin w-5 h-5 text-blue-500" />
          <span className="ml-2 text-gray-400 text-sm">Loading pricing...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (lockInfo.error) {
    return (
      <div
        className={`p-4 bg-red-900/20 rounded-lg border border-red-500/30 ${className}`}
      >
        <p className="text-sm text-red-300">{lockInfo.error}</p>
      </div>
    );
  }

  // Success state with pricing
  return (
    <div
      className={`p-4 bg-gray-800 rounded-lg border border-gray-700 ${className}`}
    >
      <div className="space-y-3">
        {/* Duration */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Duration</span>
          <span className="text-white font-semibold">
            {lockInfo.durationFormatted}
          </span>
        </div>

        {/* Price */}
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Price</span>
          <div className="text-right">
            <div className="text-white font-bold text-lg">
              {lockInfo.keyPrice} {lockInfo.tokenSymbol}
            </div>
            {lockInfo.tokenAddress !==
              "0x0000000000000000000000000000000000000000" && (
              <div className="text-xs text-gray-500 mt-0.5">ERC20 Token</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
