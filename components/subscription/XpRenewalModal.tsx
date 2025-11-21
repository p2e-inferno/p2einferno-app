/**
 * Component: XpRenewalModal
 * Modal for XP-based subscription renewal
 */

"use client";

import { useState } from "react";
import { useXpRenewal } from "@/hooks/useXpRenewal";
import { useRenewalStatus } from "@/hooks/useRenewalStatus";
import { X, Loader, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export const XpRenewalModal = ({ onClose, onSuccess }: Props) => {
  const [selectedDuration, setSelectedDuration] = useState<30 | 90 | 365>(30);
  const renewal = useXpRenewal();
  const { data: status } = useRenewalStatus();
  void status;

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
      <dialog className="modal modal-open" onClick={onClose}>
        <div
          className="modal-box max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
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

          <div className="modal-action mt-6">
            <button
              className="btn btn-primary w-full"
              onClick={() => {
                onSuccess();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        </div>
      </dialog>
    );
  }

  // Confirming state
  if (renewal.step === "confirming" && renewal.isLoading) {
    return (
      <dialog className="modal modal-open" onClick={onClose}>
        <div
          className="modal-box max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center">
            <Loader className="animate-spin w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-center mt-4">
            Processing Renewal...
          </h3>
          <p className="text-sm text-gray-600 text-center mt-2">
            Extending your subscription. This may take a moment.
          </p>
        </div>
      </dialog>
    );
  }

  // Error state
  if (renewal.error) {
    return (
      <dialog className="modal modal-open" onClick={onClose}>
        <div
          className="modal-box max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            onClick={onClose}
          >
            <X size={20} />
          </button>

          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          <h3 className="font-bold text-lg text-center mt-4">Renewal Failed</h3>

          <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-800">{renewal.error}</p>
          </div>

          <div className="modal-action mt-6 gap-2">
            <button className="btn btn-ghost flex-1" onClick={onClose}>
              Close
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleRetry}
              disabled={renewal.isLoading}
            >
              {renewal.isLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      </dialog>
    );
  }

  // Quote loading or cost breakdown
  if (!renewal.quote && renewal.isLoading) {
    return (
      <dialog className="modal modal-open" onClick={onClose}>
        <div
          className="modal-box max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center">
            <Loader className="animate-spin w-8 h-8" />
          </div>
          <p className="text-sm text-gray-600 text-center mt-4">
            Calculating renewal cost...
          </p>
        </div>
      </dialog>
    );
  }

  // Main quote view
  return (
    <dialog className="modal modal-open" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <h3 className="font-bold text-lg">Renew with XP</h3>

        {/* Duration selector */}
        <div className="mt-4">
          <label className="label">
            <span className="label-text font-semibold">Duration</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {durations.map((d) => (
              <button
                key={d.value}
                onClick={() => handleDurationChange(d.value)}
                className={`btn btn-sm ${
                  selectedDuration === d.value ? "btn-primary" : "btn-outline"
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
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Base Cost</span>
                <span className="font-semibold">
                  {renewal.quote.baseCost} XP
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Service Fee</span>
                <span className="font-semibold">
                  {renewal.quote.serviceFee} XP
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-bold">
                <span>Total Cost</span>
                <span>{renewal.quote.total} XP</span>
              </div>
            </div>

            {/* User balance */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex justify-between text-sm">
                <span className="text-blue-700">Your XP Balance</span>
                <span className="font-semibold text-blue-900">
                  {renewal.quote.userBalance} XP
                </span>
              </div>
            </div>

            {/* Affordability check */}
            {!renewal.quote.canAfford && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm text-red-800 font-semibold">
                  ❌ Insufficient XP
                </p>
                <p className="text-xs text-red-700 mt-1">
                  You need {renewal.quote.total - renewal.quote.userBalance}{" "}
                  more XP to renew
                </p>
              </div>
            )}

            {renewal.quote.canAfford && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800 font-semibold">
                  ✅ You can afford this renewal
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="modal-action mt-6 gap-2">
          <button className="btn btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={handleRenewNow}
            disabled={!renewal.quote?.canAfford || renewal.isLoading}
          >
            {renewal.isLoading ? "Processing..." : "Renew Now"}
          </button>
        </div>
      </div>
    </dialog>
  );
};
