/**
 * Component: XpRenewalModal
 * Modal for XP-based subscription purchase and renewal
 */

"use client";

import { useState } from "react";
import { useXpRenewal } from "@/hooks/useXpRenewal";
import { X, Loader, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  mode?: "renewal"; // Only renewal supported, purchase not available for XP
  onClose: () => void;
  onSuccess: () => void;
}

export const XpRenewalModal = ({ onClose, onSuccess }: Props) => {
  const [selectedDuration, setSelectedDuration] = useState<30 | 90 | 365>(30);
  const renewal = useXpRenewal(); // Always renewal mode

  const durations = [
    { value: 30 as const, label: "1 Month" },
    { value: 90 as const, label: "3 Months" },
    { value: 365 as const, label: "1 Year" },
  ];

  // Fetch quote when duration changes
  const handleDurationChange = async (duration: 30 | 90 | 365) => {
    setSelectedDuration(duration);
    await renewal.getQuote(duration);
  };

  // Initial quote fetch
  if (!renewal.quote && renewal.step === "quote") {
    setTimeout(() => renewal.getQuote(selectedDuration), 0);
  }

  const handleRenewNow = async () => {
    await renewal.executeRenewal(selectedDuration);
  };

  const handleRetry = async () => {
    await renewal.retry(selectedDuration);
  };

  // Success state
  if (renewal.step === "complete" && renewal.newExpiration) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>

          <h3 className="font-bold text-lg text-center mt-4">
            Subscription Renewed!
          </h3>

          <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-800">
              <span className="font-semibold">New Expiration:</span>
              <br />
              {renewal.newExpiration.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {renewal.transactionHash && (
            <div className="mt-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 break-all font-mono">
                {renewal.transactionHash}
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
  if (renewal.step === "confirming" && renewal.isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
          <div className="flex justify-center">
            <Loader className="animate-spin w-8 h-8 text-blue-500" />
          </div>
          <h3 className="font-bold text-lg text-center mt-4 text-white">
            Processing Renewal...
          </h3>
          <p className="text-sm text-gray-400 text-center mt-2">
            Extending your subscription. This may take a moment.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (renewal.error) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-white">Renewal Failed</h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          <div className="mt-4 p-4 bg-red-900/20 rounded-lg border border-red-500/30">
            <p className="text-sm text-red-300">{renewal.error}</p>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              onClick={onClose}
            >
              Close
            </button>
            <button
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              onClick={handleRetry}
              disabled={renewal.isLoading}
            >
              {renewal.isLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Quote loading or cost breakdown
  if (!renewal.quote && renewal.isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
          <div className="flex justify-center">
            <Loader className="animate-spin w-8 h-8 text-blue-500" />
          </div>
          <p className="text-sm text-gray-400 text-center mt-4">
            Calculating renewal cost...
          </p>
        </div>
      </div>
    );
  }

  // Main quote view
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-white">Renew with XP</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Duration selector */}
        <div className="mt-4">
          <label className="block mb-2">
            <span className="text-sm font-semibold text-gray-300">
              Duration
            </span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {durations.map((d) => (
              <button
                key={d.value}
                onClick={() => handleDurationChange(d.value)}
                className={`px-4 py-2 rounded-lg border-2 transition font-medium ${
                  selectedDuration === d.value
                    ? "border-blue-500 bg-blue-500/20 text-blue-400"
                    : "border-gray-600 text-gray-400 hover:border-gray-500"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cost breakdown */}
        {renewal.quote && (
          <div className="mt-6 space-y-3">
            <div className="bg-gray-800 p-4 rounded-lg space-y-2 border border-gray-700">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Base Cost</span>
                <span className="font-semibold text-white">
                  {renewal.quote.baseCost} XP
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Service Fee</span>
                <span className="font-semibold text-white">
                  {renewal.quote.serviceFee} XP
                </span>
              </div>
              <div className="border-t border-gray-600 pt-2 flex justify-between text-sm font-bold">
                <span className="text-white">Total Cost</span>
                <span className="text-white">{renewal.quote.total} XP</span>
              </div>
            </div>

            {/* User balance */}
            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-500/30">
              <div className="flex justify-between text-sm">
                <span className="text-blue-300">Your XP Balance</span>
                <span className="font-semibold text-blue-100">
                  {renewal.quote.userBalance} XP
                </span>
              </div>
            </div>

            {/* Affordability check */}
            {!renewal.quote.canAfford && (
              <div className="bg-red-900/20 p-4 rounded-lg border border-red-500/30">
                <p className="text-sm text-red-300 font-semibold">
                  ❌ Insufficient XP
                </p>
                <p className="text-xs text-red-400 mt-1">
                  You need {renewal.quote.total - renewal.quote.userBalance}{" "}
                  more XP to renew
                </p>
              </div>
            )}

            {renewal.quote.canAfford && (
              <div className="bg-green-900/20 p-4 rounded-lg border border-green-500/30">
                <p className="text-sm text-green-300 font-semibold">
                  ✅ You can afford this renewal
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex gap-2">
          <button
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleRenewNow}
            disabled={!renewal.quote?.canAfford || renewal.isLoading}
          >
            {renewal.isLoading ? "Processing..." : "Renew Now"}
          </button>
        </div>
      </div>
    </div>
  );
};
