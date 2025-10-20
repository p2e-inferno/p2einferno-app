import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  useCertificateClaim,
  useBootcampCompletionStatus,
} from "@/hooks/bootcamp-completion";
import { CertificatePreviewModal } from "@/components/bootcamp/CertificatePreviewModal";
import type { CertificateData } from "@/components/bootcamp/CertificateTemplate";
import { Eye } from "lucide-react";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("components:CertificateClaimButton");

interface CertificateClaimButtonProps {
  cohortId: string;
  bootcampName: string;
  lockAddress: string | null;
  isCompleted: boolean;
  alreadyClaimed: boolean;
  onClaimed?: () => void;
}

export function CertificateClaimButton({
  cohortId,
  bootcampName,
  lockAddress,
  isCompleted,
  alreadyClaimed,
  onClaimed,
}: CertificateClaimButtonProps) {
  const { refetch } = useBootcampCompletionStatus(cohortId);
  const {
    isClaiming,
    hasClaimed,
    claimCertificate,
    claimData,
    retryAttestation,
  } = useCertificateClaim(cohortId, () => {
    refetch();
    onClaimed?.();
  });

  const [showPreview, setShowPreview] = useState(false);
  const [certificateData, setCertificateData] =
    useState<CertificateData | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [storedImageUrl, setStoredImageUrl] = useState<string | null>(null);
  const [blockchainVerified, setBlockchainVerified] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);

  const handlePreviewClick = async () => {
    setIsLoadingPreview(true);
    try {
      const response = await fetch(
        `/api/user/bootcamp/${cohortId}/certificate-preview`,
      );
      if (!response.ok) {
        throw new Error("Failed to load certificate data");
      }
      const result = await response.json();

      // Store blockchain verification status and stored image URL
      setBlockchainVerified(result.hasKey || false);
      setStoredImageUrl(result.storedImageUrl || null);
      setEnrollmentId(result.enrollmentId || null);

      // If we have a stored image, we don't need certificate data
      if (result.storedImageUrl && result.isClaimed) {
        setCertificateData(null);
      } else {
        setCertificateData(result.data);
      }

      setShowPreview(true);
    } catch (error) {
      log.error("Failed to load certificate preview:", error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  if (!isCompleted) {
    return (
      <Button disabled>Complete all milestones to claim certificate</Button>
    );
  }

  if (!lockAddress) {
    return <Button disabled>Certificate not configured yet</Button>;
  }

  const alreadyHasKey =
    Boolean((claimData as any)?.alreadyHasKey) || alreadyClaimed;
  if (alreadyHasKey || hasClaimed) {
    return (
      <>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Button disabled variant="secondary">
              {alreadyHasKey
                ? "Certificate Already Held"
                : "Certificate Claimed ✓"}
            </Button>
            <Button
              variant="outline"
              onClick={handlePreviewClick}
              disabled={isLoadingPreview}
              className="flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              {isLoadingPreview ? "Loading..." : "Preview"}
            </Button>
          </div>
          {claimData?.attestationPending && (
            <Button variant="outline" onClick={() => retryAttestation()}>
              Retry Attestation
            </Button>
          )}
        </div>
        <CertificatePreviewModal
          open={showPreview}
          onOpenChange={setShowPreview}
          certificateData={certificateData || undefined}
          storedImageUrl={storedImageUrl || undefined}
          isClaimed={blockchainVerified || alreadyHasKey}
          enrollmentId={enrollmentId || undefined}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          onClick={async () => {
            await claimCertificate();
            onClaimed?.();
          }}
          disabled={isClaiming}
        >
          {isClaiming ? "Claiming..." : `Claim ${bootcampName} Certificate`}
        </Button>
        <Button
          variant="outline"
          onClick={handlePreviewClick}
          disabled={isLoadingPreview}
          className="flex items-center gap-2"
        >
          <Eye className="h-4 w-4" />
          {isLoadingPreview ? "Loading..." : "Preview"}
        </Button>
      </div>
      <CertificatePreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        certificateData={certificateData || undefined}
        storedImageUrl={storedImageUrl || undefined}
        isClaimed={blockchainVerified}
        enrollmentId={enrollmentId || undefined}
      />
    </>
  );
}
