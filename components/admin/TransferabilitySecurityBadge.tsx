"use client";

import { Badge } from "@/components/ui/badge";

interface TransferabilitySecurityBadgeProps {
  lockAddress?: string | null;
  transferabilitySecured?: boolean | null;
  reason?: string | null;
  className?: string;
}

/**
 * Renders an orange "Security Risk" badge when a lock exists and it is transferable.
 *
 * Security rule: non-transferable locks should have transferFeeBasisPoints = 10000 on-chain.
 */
export function TransferabilitySecurityBadge({
  lockAddress,
  transferabilitySecured,
  reason,
  className,
}: TransferabilitySecurityBadgeProps) {
  if (!lockAddress) return null;
  if (transferabilitySecured === true) return null;

  return (
    <Badge
      className={`bg-orange-600 whitespace-nowrap shrink-0 ${className || ""}`}
      title={
        reason
          ? `Security Risk: ${reason}`
          : "Keys appear transferable (transferFeeBasisPoints != 10000)"
      }
    >
      Security Risk
    </Badge>
  );
}
