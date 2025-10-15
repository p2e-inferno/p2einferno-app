import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { AttestationService } from "@/lib/attestation";
import { P2E_SCHEMA_UIDS } from "@/lib/attestation/core/config";
import { usePrivy } from "@privy-io/react-auth";

export function useCertificateClaim(cohortId: string) {
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
      const resp = await axios.post("/api/bootcamp/certificate/claim", { cohortId });
      if (resp.data?.success) {
        setHasClaimed(true);
        setClaimData(resp.data);
        if (resp.data.attestationPending) {
          toast.success("Certificate claimed! Attestation pending - retry available.");
        } else {
          toast.success("Certificate claimed successfully!");
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
        await axios.post("/api/bootcamp/certificate/commit-attestation", { cohortId, attestationUid: result.attestationUid });
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
