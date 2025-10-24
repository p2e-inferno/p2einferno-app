import { useState } from "react";
import api from "@/lib/helpers/api";
import toast from "react-hot-toast";
import { AttestationService } from "@/lib/attestation";
import { P2E_SCHEMA_UIDS } from "@/lib/attestation/core/config";
import { usePrivy } from "@privy-io/react-auth";
import { tryAutoSaveCertificate } from "@/lib/certificate/generator";

export function useCertificateClaim(cohortId: string, onSuccess?: () => void) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimData, setClaimData] = useState<{
    txHash?: string;
    attestationUid?: string | null;
    attestationPending?: boolean;
  } | null>(null);

  const { user } = usePrivy();

  const claimCertificate = async () => {
    setIsClaiming(true);
    setClaimError(null);
    try {
      const resp = await api.post("/bootcamp/certificate/claim", { cohortId });
      if (resp.data?.success) {
        setHasClaimed(true);
        setClaimData(resp.data);
        onSuccess?.();
        
        // Attempt auto-save certificate image (non-blocking)
        if (!resp.data.alreadyHasKey) {
          tryAutoSaveCertificate(cohortId)
            .then((result) => {
              if (result.success) {
                toast("Certificate image saved automatically", { 
                  icon: "ℹ️",
                  duration: 3000,
                });
              } else {
                toast("Certificate claimed! Click Preview to save image", {
                  icon: "⚠️",
                  duration: 4000,
                });
              }
            })
            .catch(() => {
              toast("Certificate claimed! Click Preview to save image", {
                icon: "⚠️",
                duration: 4000,
              });
            });
        }

        if (resp.data.attestationPending) {
          toast.success("Certificate claimed! Attestation pending - retry available.");
        } else {
          if (resp.data.alreadyHasKey) {
            toast.success("You already have this certificate");
          } else {
            toast.success("Certificate claimed successfully!");
          }
        }
      } else {
        throw new Error(resp.data?.error || "Claim failed");
      }
    } catch (e: any) {
      const message = e?.response?.data?.error || e?.message || "Failed to claim certificate";
      setClaimError(message);
      toast.error(message);
    } finally {
      setIsClaiming(false);
    }
  };

  const retryAttestation = async () => {
    try {
      // Attempt client-side attestation using user's connected wallet
      const wallet = (user as any)?.wallet || (user?.linkedAccounts || []).find((a: any) => a.type === 'wallet');
      if (!wallet || !wallet.address) {
        toast("Connect a wallet to create attestation");
        return;
      }

      const attestationService = new AttestationService();
      const result = await attestationService.createAttestation({
        schemaUid: P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION,
        recipient: wallet.address,
        data: {
          cohortId,
          userAddress: wallet.address,
          completionDate: Math.floor(Date.now() / 1000),
          certificateTxHash: claimData?.txHash || "",
        },
        wallet,
        revocable: false,
      } as any);

      if (result?.success && result.attestationUid) {
        // Commit UID to server for persistence
        await api.post("/bootcamp/certificate/commit-attestation", { cohortId, attestationUid: result.attestationUid });
        setClaimData((prev) => ({ ...prev, attestationUid: result.attestationUid, attestationPending: false }));
        toast.success("Attestation created successfully!");
      } else {
        toast.error(result?.error || "Failed to create attestation");
      }
    } catch (e) {
      toast.error("Failed to retry attestation");
    }
  };

  return { isClaiming, hasClaimed, claimError, claimData, claimCertificate, retryAttestation };
}
