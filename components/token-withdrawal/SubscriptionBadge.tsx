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

  const baseClasses = "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border transition-all duration-300";

  if (isLoading) {
    return (
      <div className={`${baseClasses} bg-white/5 border-white/10 text-white/50 animate-pulse`}>
        <span>Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${baseClasses} bg-red-500/10 border-red-500/20 text-red-400`}>
        <div className="w-1.5 h-1.5 rounded-full bg-red-400 mr-2 shadow-[0_0_8px_rgba(248,113,113,0.6)]" />
        Error
      </div>
    );
  }

  if (!hasValidKey) {
    return (
      <div className={`${baseClasses} bg-white/5 border-white/10 text-white/60`}>
        <div className="w-1.5 h-1.5 rounded-full bg-white/40 mr-2" />
        {compact ? "No Access" : "DG Nation Membership Required"}
      </div>
    );
  }

  // User has valid key
  return (
    <div className={`${baseClasses} bg-green-500/10 border-green-500/20 text-green-400 group hover:bg-green-500/20 hover:border-green-500/30`}>
      <div className="relative flex items-center mr-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)] group-hover:scale-110 transition-transform" />
        <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-green-400 animate-ping opacity-75" />
      </div>
      <span className="tracking-wide">
        {compact ? "Active" : "DG Nation Member"}
        {showExpiry && expiresAt && (
          <span className="ml-1 text-green-700">
            • Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}
          </span>
        )}
      </span>
    </div>
  );
}

