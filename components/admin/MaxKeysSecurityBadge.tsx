"use client";

import { Badge } from "@/components/ui/badge";

interface MaxKeysSecurityBadgeProps {
  lockAddress?: string | null;
  maxKeysSecured?: boolean | null;
  reason?: string | null;
  className?: string;
}

/**
 * Renders an orange "Security Risk" badge when a lock exists and its max-keys configuration does not secure purchases.
 *
 * @param lockAddress - The address of the lock; if not provided, nothing is rendered.
 * @param maxKeysSecured - Indicates whether the lock's max-keys setting prevents additional purchases.
 * @param reason - Optional explanatory text included in the badge title when present.
 * @param className - Optional additional CSS classes applied to the badge.
 * @returns `null` when the badge should not be shown, otherwise a Badge element indicating a security risk.
 */
export function MaxKeysSecurityBadge({
  lockAddress,
  maxKeysSecured,
  reason,
  className,
}: MaxKeysSecurityBadgeProps) {
  if (!lockAddress) return null;
  if (maxKeysSecured === true) return null;

  return (
    <Badge
      className={`bg-orange-600 ${className || ""}`}
      title={
        reason
          ? `Security Risk: ${reason}`
          : "Purchases still enabled (maxNumberOfKeys > 0)"
      }
    >
      Security Risk
    </Badge>
  );
}