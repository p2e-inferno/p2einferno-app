/**
 * Component: SubscriptionStatusCard
 * Main dashboard widget showing DG Nation membership status and renewal options
 */

"use client";

import { useState } from "react";
import { useRenewalStatus } from "@/hooks/useRenewalStatus";
import {
  getExpirationStatus,
  calculateDaysRemaining,
} from "@/lib/helpers/xp-renewal-helpers";
import { XpRenewalModal } from "./XpRenewalModal";
import { CryptoRenewalModal } from "./CryptoRenewalModal";
import { Loader } from "lucide-react";

interface Props {
  onRenewalComplete?: () => void;
  className?: string;
}

export const SubscriptionStatusCard = ({
  onRenewalComplete,
  className = "",
}: Props) => {
  const { data: status, isLoading, error } = useRenewalStatus();
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

  if (error || !status) {
    return (
      <div className={`card p-6 bg-red-50 border border-red-200 ${className}`}>
        <h3 className="font-semibold text-red-900">
          Unable to Load Subscription Status
        </h3>
        <p className="text-sm text-red-700 mt-1">
          {error instanceof Error ? error.message : "Please try again later"}
        </p>
      </div>
    );
  }

  if (!status.hasActiveKey) {
    return (
      <div
        className={`card p-6 bg-gray-50 border border-gray-200 ${className}`}
      >
        <h3 className="text-lg font-semibold text-gray-900">
          DG Nation Membership
        </h3>
        <p className="text-sm text-gray-600 mt-2">No active subscription</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button className="btn btn-sm btn-outline">💰 Get Membership</button>
          <button className="btn btn-sm btn-outline">Learn More</button>
        </div>
      </div>
    );
  }

  // Calculate days remaining and status
  const currentExpTime = new Date(status.currentExpiration).getTime() / 1000;
  const daysRemaining = calculateDaysRemaining(Math.floor(currentExpTime));
  const expirationStatus = getExpirationStatus(daysRemaining);

  // Color mapping
  const statusColors = {
    healthy: "text-green-600 bg-green-50 border-green-200",
    warning: "text-yellow-600 bg-yellow-50 border-yellow-200",
    urgent: "text-red-600 bg-red-50 border-red-200",
    expired: "text-red-900 bg-red-100 border-red-300",
  };

  const buttonColor = {
    healthy: "btn-primary",
    warning: "btn-warning",
    urgent: "btn-error",
    expired: "btn-error",
  };

  const color = statusColors[expirationStatus];
  const btnColor = buttonColor[expirationStatus];

  return (
    <>
      <div className={`card ${color} border ${className}`}>
        <div className="p-6">
          <h3 className="text-lg font-semibold">DG Nation Membership</h3>

          {/* Days remaining display */}
          <div className="mt-4">
            <div className="text-3xl font-bold">
              {daysRemaining < 0 ? "EXPIRED" : `${daysRemaining} days`}
            </div>
            <p className="text-sm mt-1">
              {daysRemaining < 0
                ? "Your subscription has expired"
                : `Expires ${new Date(
                    status.currentExpiration,
                  ).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`}
            </p>
          </div>

          {/* Status message */}
          {daysRemaining < 0 && (
            <p className="text-sm font-semibold mt-3">
              Renew now to restore access
            </p>
          )}
          {daysRemaining >= 0 && daysRemaining < 7 && (
            <p className="text-sm font-semibold mt-3">
              Renew soon to avoid interruption
            </p>
          )}

          {/* Renewal buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-6">
            <button
              onClick={() => setSelectedMethod("crypto")}
              className={`btn btn-sm ${btnColor} text-white`}
              disabled={isLoading}
            >
              💰 Crypto
            </button>
            <button
              onClick={() => setSelectedMethod("xp")}
              className={`btn btn-sm ${btnColor} text-white`}
              disabled={isLoading}
            >
              ⚡ XP
            </button>
            <button
              onClick={() => setSelectedMethod("paystack")}
              className="btn btn-sm btn-disabled text-gray-400"
              title="Coming soon"
            >
              💳 Card
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedMethod === "crypto" && (
        <CryptoRenewalModal
          onClose={() => setSelectedMethod(null)}
          onSuccess={() => {
            setSelectedMethod(null);
            onRenewalComplete?.();
          }}
        />
      )}

      {selectedMethod === "xp" && (
        <XpRenewalModal
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
