/**
 * Component: CryptoRenewalModal
 * Modal for crypto-based subscription renewal
 */

"use client";

import { useState } from "react";
import { X, Loader, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export const CryptoRenewalModal = ({ onClose, onSuccess }: Props) => {
  const [selectedDuration, setSelectedDuration] = useState<30 | 90 | 365>(30);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<
    "select" | "confirming" | "success" | "error"
  >("select");
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    newExpiration: string;
    txHash?: string;
  } | null>(null);

  const durations = [
    { value: 30 as const, label: "1 Month", cost: "0.05 ETH" },
    { value: 90 as const, label: "3 Months", cost: "0.15 ETH" },
    { value: 365 as const, label: "1 Year", cost: "0.50 ETH" },
  ];

  const selectedOption = durations.find((d) => d.value === selectedDuration);

  const handleRenewNow = async () => {
    setIsLoading(true);
    setStep("confirming");
    setError(null);

    try {
      // TODO: Implement actual crypto renewal
      // This would call useExtendKey hook
      // For now, show success after a delay

      setTimeout(() => {
        setSuccessData({
          newExpiration: new Date(
            Date.now() + selectedDuration * 24 * 60 * 60 * 1000,
          ).toLocaleDateString(),
          txHash:
            "0x" +
            Array(64)
              .fill(0)
              .map(() => Math.floor(Math.random() * 16).toString(16))
              .join(""),
        });
        setStep("success");
        setIsLoading(false);
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to process renewal");
      setStep("error");
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    handleRenewNow();
  };

  // Success state
  if (step === "success" && successData) {
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
              {successData.newExpiration}
            </p>
          </div>

          {successData.txHash && (
            <div className="mt-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 break-all font-mono">
                {successData.txHash}
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
  if (step === "confirming" && isLoading) {
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
            Please confirm the transaction in your wallet and wait for
            confirmation.
          </p>
        </div>
      </dialog>
    );
  }

  // Error state
  if (step === "error" && error) {
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
            <p className="text-sm text-red-800">{error}</p>
          </div>

          <div className="modal-action mt-6 gap-2">
            <button className="btn btn-ghost flex-1" onClick={onClose}>
              Close
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleRetry}
              disabled={isLoading}
            >
              {isLoading ? "Retrying..." : "Retry"}
            </button>
          </div>
        </div>
      </dialog>
    );
  }

  // Main selection view
  return (
    <dialog className="modal modal-open" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <h3 className="font-bold text-lg">Renew with Crypto</h3>

        {/* Duration selector */}
        <div className="mt-4 space-y-3">
          {durations.map((d) => (
            <div
              key={d.value}
              onClick={() => setSelectedDuration(d.value)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                selectedDuration === d.value
                  ? "border-primary bg-primary/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">{d.label}</span>
                <span className="text-sm font-bold text-primary">{d.cost}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Selected duration info */}
        {selectedOption && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm">
              <span className="font-semibold text-blue-900">
                You&apos;re about to renew
              </span>
              <br />
              <span className="text-blue-700">
                {selectedOption.label} for {selectedOption.cost}
              </span>
            </p>
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
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : "Renew Now"}
          </button>
        </div>
      </div>
    </dialog>
  );
};
