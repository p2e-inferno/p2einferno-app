import { Button } from "@/components/ui/button";
import {
  useCertificateClaim,
  useBootcampCompletionStatus,
} from "@/hooks/bootcamp-completion";

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
      <div className="flex flex-col gap-2">
        <Button disabled variant="secondary">
          {alreadyHasKey ? "Certificate Already Held" : "Certificate Claimed ✓"}
        </Button>
        {claimData?.attestationPending && (
          <Button variant="outline" onClick={() => retryAttestation()}>
            Retry Attestation
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      onClick={async () => {
        await claimCertificate();
        onClaimed?.();
      }}
      disabled={isClaiming}
    >
      {isClaiming ? "Claiming..." : `Claim ${bootcampName} Certificate`}
    </Button>
  );
}
