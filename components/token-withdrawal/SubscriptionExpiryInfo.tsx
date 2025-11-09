/**
 * SubscriptionExpiryInfo Component
 *
 * Shows when the user's DG Nation NFT subscription expires.
 * Displays a warning if expiration is approaching (within 7 days by default).
 */

import React from "react";
import { useDGNationKey } from "@/hooks/useDGNationKey";
import { format, isBefore, addDays, formatDistanceToNow } from "date-fns";

interface SubscriptionExpiryInfoProps {
  showRenewWarning?: boolean;
  warningDays?: number;
}

export function SubscriptionExpiryInfo({
  showRenewWarning = true,
  warningDays = 7,
}: SubscriptionExpiryInfoProps) {
  const { hasValidKey, expiresAt, isLoading, error } = useDGNationKey();

  if (isLoading || error || !hasValidKey || !expiresAt) {
    return null; // Don't show anything if there's no valid subscription
  }

  const now = new Date();
  const warningDate = addDays(now, warningDays);
  const isExpiringSoon = isBefore(expiresAt, warningDate);

  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-700">
        DG Nation Subscription
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Your subscription expires on{" "}
        <span className="font-medium">{format(expiresAt, "PPP")}</span>
      </p>

      {showRenewWarning && isExpiringSoon && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-700">
            <span className="font-medium">Expiring soon!</span> Your DG Nation
            membership expires in {formatDistanceToNow(expiresAt)}. Renew to
            maintain pullout access.
          </p>
          <a
            href="https://app.unlock-protocol.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center text-sm text-yellow-800 font-medium hover:underline"
          >
            Renew Subscription
            <svg
              className="w-4 h-4 ml-1"
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
      )}
    </div>
  );
}
