/**
 * Component: SubscriptionStatusCard
 * Main dashboard widget showing DG Nation membership status and renewal options
 */

"use client";

import { useState } from "react";
import { useDGNationKey } from "@/hooks/useDGNationKey";
import {
  getExpirationStatus,
  calculateDaysRemaining,
} from "@/lib/helpers/xp-renewal-helpers";
import { XpRenewalModal } from "./XpRenewalModal";
import { CryptoRenewalModal } from "./CryptoRenewalModal";
import { MethodSelectionModal } from "./MethodSelectionModal";
import { Loader, X } from "lucide-react";

interface Props {
  onRenewalComplete?: () => void;
  className?: string;
}

export const SubscriptionStatusCard = ({
  onRenewalComplete,
  className = "",
}: Props) => {
  const { hasValidKey, expiresAt, isLoading, error } = useDGNationKey();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<
    "crypto" | "xp" | "paystack" | null
  >(null);

  if (isLoading) {
    return (
      <div className={`card p-6 ${className}`}>
        <div className="flex items-center justify-center gap-2">
          <Loader className="animate-spin" size={20} />
          <span>Loading subscription status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    if (isDismissed) return null;

    return (
      <div
        className={`card p-6 bg-red-900/20 border border-red-500/30 ${className} relative`}
      >
        <button
          onClick={() => setIsDismissed(true)}
          className="absolute top-4 right-4 text-red-400 hover:text-red-300 transition-colors"
          aria-label="Dismiss error"
        >
          <X size={16} />
        </button>
        <h3 className="font-semibold text-red-400 pr-8">
          Unable to Load Subscription Status
        </h3>
        <p className="text-sm text-red-300 mt-1">{error}</p>
      </div>
    );
  }

  if (!hasValidKey) {
    return (
      <>
        <div
          className={`card p-6 bg-gray-800 border border-gray-700 ${className}`}
        >
          <h3 className="text-lg font-semibold text-white">
            DG Nation Membership
          </h3>
          <p className="text-sm text-gray-400 mt-2">No active subscription</p>
          <div className="mt-4">
            <button
              onClick={() => setShowMethodModal(true)}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-blue-500 text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              💰 Get Membership
            </button>
          </div>
        </div>

        {/* Method Selection Modal */}
        {showMethodModal && (
          <MethodSelectionModal
            mode="purchase"
            onSelectMethod={(method) => {
              setShowMethodModal(false);
              setSelectedMethod(method);
            }}
            onClose={() => setShowMethodModal(false)}
          />
        )}

        {/* Payment Modals */}
        {selectedMethod === "crypto" && (
          <CryptoRenewalModal
            mode="purchase"
            onClose={() => setSelectedMethod(null)}
            onSuccess={() => {
              setSelectedMethod(null);
              onRenewalComplete?.();
            }}
          />
        )}

        {/* XP not available for initial purchase */}
      </>
    );
  }

  // Calculate days remaining and status
  const currentExpTime = expiresAt ? expiresAt.getTime() / 1000 : 0;
  const daysRemaining = calculateDaysRemaining(Math.floor(currentExpTime));
  const expirationStatus = getExpirationStatus(daysRemaining);

  // Color mapping
  const statusColors = {
    healthy: "bg-transparent border-gray-700",
    warning: "bg-transparent border-gray-700",
    urgent: "bg-transparent border-gray-700",
    expired: "bg-transparent border-gray-700",
  };

  const textColors = {
    healthy: "text-green-400",
    warning: "text-yellow-400",
    urgent: "text-red-400",
    expired: "text-red-500",
  };

  const color = statusColors[expirationStatus];
  const textColor = textColors[expirationStatus];

  return (
    <>
      <div className={`card ${color} border ${className}`}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white">
            DG Nation Membership
          </h3>

          {/* Days remaining display */}
          <div className="mt-4">
            <div className={`text-3xl font-bold ${textColor}`}>
              {daysRemaining < 0 ? "EXPIRED" : `${daysRemaining} days`}
            </div>
            <p className="text-sm mt-1 text-gray-400">
              {daysRemaining < 0
                ? "Your subscription has expired"
                : `Expires ${
                    expiresAt?.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) || ""
                  }`}
            </p>
          </div>

          {/* Status message */}
          {daysRemaining < 0 && (
            <p className="text-sm font-semibold mt-3 text-red-400">
              Renew now to restore access
            </p>
          )}
          {daysRemaining >= 0 && daysRemaining < 7 && (
            <p className="text-sm font-semibold mt-3 text-yellow-400">
              Renew soon to avoid interruption
            </p>
          )}

          {/* Renewal button */}
          <div className="mt-6">
            <button
              onClick={() => setShowMethodModal(true)}
              className="w-full inline-flex justify-center items-center px-4 py-2 border border-blue-500 text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {daysRemaining < 0 ? "Renew Membership" : "Renew Now"}
            </button>
          </div>
        </div>
      </div>

      {/* Method Selection Modal */}
      {showMethodModal && (
        <MethodSelectionModal
          mode="renewal"
          onSelectMethod={(method) => {
            setShowMethodModal(false);
            setSelectedMethod(method);
          }}
          onClose={() => setShowMethodModal(false)}
        />
      )}

      {/* Payment Modals */}
      {selectedMethod === "crypto" && (
        <CryptoRenewalModal
          mode="renewal"
          onClose={() => setSelectedMethod(null)}
          onSuccess={() => {
            setSelectedMethod(null);
            onRenewalComplete?.();
          }}
        />
      )}

      {selectedMethod === "xp" && (
        <XpRenewalModal
          mode="renewal"
          onClose={() => setSelectedMethod(null)}
          onSuccess={() => {
            setSelectedMethod(null);
            onRenewalComplete?.();
          }}
        />
      )}
    </>
  );
};
