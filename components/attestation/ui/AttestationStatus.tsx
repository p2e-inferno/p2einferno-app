/**
 * Attestation Status Component
 * Shows the current status of an attestation (active, revoked, expired)
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from "lucide-react";

interface AttestationStatusProps {
  isRevoked: boolean;
  isExpired?: boolean;
  className?: string;
}

export const AttestationStatus: React.FC<AttestationStatusProps> = ({
  isRevoked,
  isExpired = false,
  className = "",
}) => {
  if (isRevoked) {
    return (
      <Badge
        variant="secondary"
        className={`${className} text-red-600 bg-red-100 dark:bg-red-900/20`}
      >
        <XCircle className="w-3 h-3 mr-1" />
        Revoked
      </Badge>
    );
  }

  if (isExpired) {
    return (
      <Badge
        variant="secondary"
        className={`${className} text-orange-600 bg-orange-100 dark:bg-orange-900/20`}
      >
        <Clock className="w-3 h-3 mr-1" />
        Expired
      </Badge>
    );
  }

  return (
    <Badge
      variant="default"
      className={`${className} text-green-600 bg-green-100 dark:bg-green-900/20`}
    >
      <CheckCircle className="w-3 h-3 mr-1" />
      Active
    </Badge>
  );
};
