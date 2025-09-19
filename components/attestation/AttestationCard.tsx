/**
 * Attestation Card Component
 * Displays attestation information in a card format
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Attestation } from "@/lib/attestation";
import { AttestationStatus } from "./ui/AttestationStatus";
import { AttestationBadge } from "./ui/AttestationBadge";
import {
  formatAttestationDataForDisplay,
  truncateAttestationUid,
  isAttestationExpired,
  getTimeUntilExpiration,
} from "@/lib/attestation";
import { Calendar, User, Hash, Clock } from "lucide-react";

interface AttestationCardProps {
  attestation: Attestation;
  showDetails?: boolean;
  className?: string;
}

export const AttestationCard: React.FC<AttestationCardProps> = ({
  attestation,
  showDetails = true,
  className = "",
}) => {
  const formattedData = formatAttestationDataForDisplay(attestation.data);
  const isExpired = isAttestationExpired(attestation.expiration_time);
  const timeUntilExpiration = getTimeUntilExpiration(
    attestation.expiration_time,
  );

  return (
    <Card className={`${className} transition-all hover:shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {(attestation as any).attestation_schemas?.name ||
                "Unknown Schema"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {(attestation as any).attestation_schemas?.description ||
                "No description available"}
            </p>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <AttestationBadge
              category={
                (attestation as any).attestation_schemas?.category ||
                "verification"
              }
            />
            <AttestationStatus
              isRevoked={attestation.is_revoked}
              isExpired={isExpired}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center space-x-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Recipient:</span>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {truncateAttestationUid(attestation.recipient)}
            </code>
          </div>

          <div className="flex items-center space-x-2">
            <Hash className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">UID:</span>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {truncateAttestationUid(attestation.attestation_uid)}
            </code>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span>{new Date(attestation.created_at).toLocaleDateString()}</span>
          </div>

          {attestation.expiration_time && (
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Expires:</span>
              <span
                className={isExpired ? "text-red-500" : "text-muted-foreground"}
              >
                {timeUntilExpiration || "Never"}
              </span>
            </div>
          )}
        </div>

        {/* Attestation Data */}
        {showDetails && Object.keys(formattedData).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Attestation Data</h4>
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              {Object.entries(formattedData).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}:
                  </span>
                  <span className="font-mono text-xs">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revocation Info */}
        {attestation.is_revoked && attestation.revocation_time && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
              <span className="text-sm font-medium">Revoked</span>
              <span className="text-xs">
                on {new Date(attestation.revocation_time).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
