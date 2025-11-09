/**
 * SubscriptionBadge Component
 *
 * Displays the user's DG Nation subscription status as a badge.
 * Shows active/inactive status and optionally the expiration time.
 */

import React from "react";
import { useDGNationKey } from "@/hooks/useDGNationKey";
import { formatDistanceToNow } from "date-fns";

interface SubscriptionBadgeProps {
  showExpiry?: boolean;
  compact?: boolean;
}

export function SubscriptionBadge({
  showExpiry = true,
  compact = false,
}: SubscriptionBadgeProps) {
  const { hasValidKey, expiresAt, isLoading, error } = useDGNationKey();

  if (isLoading) {
    return (
      <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <span className="animate-pulse">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
        Error
      </div>
    );
  }

  if (!hasValidKey) {
    return (
      <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
          />
        </svg>
        {compact ? "No Access" : "DG Nation Membership Required"}
      </div>
    );
  }

  // User has valid key
  return (
    <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      {compact ? "Active" : "DG Nation Member"}
      {showExpiry && expiresAt && (
        <span className="ml-1 text-green-700">
          • Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}
        </span>
      )}
    </div>
  );
}
