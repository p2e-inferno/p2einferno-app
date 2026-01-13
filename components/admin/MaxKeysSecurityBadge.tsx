"use client";

import { Badge } from "@/components/ui/badge";

interface MaxKeysSecurityBadgeProps {
  lockAddress?: string | null;
  maxKeysSecured?: boolean | null;
  reason?: string | null;
  className?: string;
}

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
