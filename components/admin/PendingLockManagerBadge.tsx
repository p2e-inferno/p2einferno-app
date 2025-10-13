"use client";

import { Badge } from "@/components/ui/badge";

interface PendingLockManagerBadgeProps {
  lockAddress?: string | null;
  lockManagerGranted?: boolean | null;
  reason?: string | null;
  className?: string;
}

export function PendingLockManagerBadge({
  lockAddress,
  lockManagerGranted,
  reason,
  className,
}: PendingLockManagerBadgeProps) {
  if (!lockAddress) return null;
  if (lockManagerGranted === true) return null;

  return (
    <Badge
      className={`bg-orange-600 ${className || ""}`}
      title={reason ? `Grant pending: ${reason}` : "Grant pending"}
    >
      Grant Pending
    </Badge>
  );
}
