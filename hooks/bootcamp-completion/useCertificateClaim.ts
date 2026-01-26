import { useState } from "react";
import api from "@/lib/helpers/api";
import toast from "react-hot-toast";
import { tryAutoSaveCertificate } from "@/lib/certificate/generator";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import type {
  DelegatedAttestationSignature,
  SchemaFieldData,
} from "@/lib/attestation/api/types";

function isUserRejectedError(err: any): boolean {
  const code = err?.code;
  const name = (err?.name || "").toString().toLowerCase();
  const msg = (err?.message || "").toString().toLowerCase();
  return (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    name.includes("userrejected") ||
    msg.includes("user rejected") ||
    msg.includes("rejected") ||
    msg.includes("denied") ||
    msg.includes("cancel") ||
    msg.includes("canceled") ||
    msg.includes("cancelled")
  );
}

export function useCertificateClaim(cohortId: string, onSuccess?: () => void) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimData, setClaimData] = useState<{
    txHash?: string;
    attestationUid?: string | null;
    attestationPending?: boolean;
    attestationScanUrl?: string | null;
  } | null>(null);

  const { signAttestation } = useGaslessAttestation();

  const claimCertificate = async () => {
    setIsClaiming(true);
    setClaimError(null);
    try {
      const initial = await api.post("/bootcamp/certificate/claim", {
        cohortId,
      });
      if (!initial.data?.success) {
        throw new Error(initial.data?.error || "Claim failed");
      }

      setHasClaimed(true);
      onSuccess?.();

      const maybePayload = initial.data?.attestationPayload as
        | {
            schemaKey: string;
            recipient: string;
            schemaData: SchemaFieldData[];
          }
        | undefined;
      const attestationRequired = Boolean(initial.data?.attestationRequired);

      // Attempt auto-save certificate image (non-blocking)
      if (!initial.data.alreadyHasKey) {
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

      if (attestationRequired && maybePayload) {
        // Smooth UX: don't show a "success" toast before the proof signature happens.
        let signature: DelegatedAttestationSignature;
        try {
          signature = await signAttestation({
            schemaKey: maybePayload.schemaKey as any,
            recipient: maybePayload.recipient,
            schemaData: maybePayload.schemaData,
          });
        } catch (e: any) {
          if (isUserRejectedError(e)) {
            setClaimData({
              txHash: initial.data?.txHash,
              attestationUid: null,
              attestationPending: true,
              attestationScanUrl: null,
            });
            toast("Completion proof cancelled — certificate claimed.", {
              icon: "⚠️",
              duration: 4500,
            });
            return;
          }
          // Proof failure should not look like claim failure (claim/key grant already succeeded).
          setClaimData({
            txHash: initial.data?.txHash,
            attestationUid: null,
            attestationPending: true,
            attestationScanUrl: null,
          });
          toast(
            `Certificate claimed — proof failed. You can retry proof from the button.\n\n${e?.message || "Unknown proof error"}`,
            { icon: "⚠️", duration: 6500 },
          );
          return;
        }

        const commit = await api.post("/bootcamp/certificate/claim", {
          cohortId,
          attestationSignature: signature,
        });

        if (!commit.data?.success) {
          setClaimData({
            txHash: initial.data?.txHash,
            attestationUid: null,
            attestationPending: true,
            attestationScanUrl: null,
          });
          toast("Certificate claimed — proof failed (retry available).", {
            icon: "⚠️",
            duration: 4500,
          });
          return;
        }

        setClaimData({
          txHash: initial.data?.txHash,
          attestationUid: commit.data?.attestationUid ?? null,
          attestationPending: Boolean(commit.data?.attestationPending),
          attestationScanUrl: commit.data?.attestationScanUrl ?? null,
        });

        if (commit.data?.attestationUid) {
          toast.success("Certificate claimed successfully!");
        } else {
          toast("Certificate claimed — proof pending (retry available).", {
            icon: "⚠️",
            duration: 4500,
          });
        }
        return;
      }

      setClaimData({
        txHash: initial.data?.txHash,
        attestationUid: initial.data?.attestationUid ?? null,
        attestationPending: Boolean(initial.data?.attestationPending),
        attestationScanUrl: initial.data?.attestationScanUrl ?? null,
      });

      if (initial.data.attestationPending) {
        toast.success("Certificate claimed! Proof pending — retry available.");
      } else if (initial.data.alreadyHasKey) {
        toast.success("You already have this certificate");
      } else {
        toast.success("Certificate claimed successfully!");
      }
    } catch (e: any) {
      const message =
        e?.response?.data?.error || e?.message || "Failed to claim certificate";
      setClaimError(message);
      toast.error(message);
    } finally {
      setIsClaiming(false);
    }
  };

  const retryAttestation = async () => {
    try {
      const initial = await api.post("/bootcamp/certificate/claim", {
        cohortId,
      });
      if (!initial.data?.success) {
        throw new Error(initial.data?.error || "Retry failed");
      }

      if (initial.data?.attestationUid) {
        setClaimData((prev) => ({
          ...prev,
          attestationUid: initial.data.attestationUid,
          attestationPending: false,
          attestationScanUrl: initial.data.attestationScanUrl ?? null,
        }));
        toast.success("Proof already recorded");
        return;
      }

      const maybePayload = initial.data?.attestationPayload as
        | {
            schemaKey: string;
            recipient: string;
            schemaData: SchemaFieldData[];
          }
        | undefined;

      if (!initial.data?.attestationRequired || !maybePayload) {
        toast.error("No proof available to retry");
        return;
      }

      let signature: DelegatedAttestationSignature;
      try {
        signature = await signAttestation({
          schemaKey: maybePayload.schemaKey as any,
          recipient: maybePayload.recipient,
          schemaData: maybePayload.schemaData,
        });
      } catch (e: any) {
        if (isUserRejectedError(e)) {
          toast("Completion proof cancelled.", { icon: "⚠️", duration: 3500 });
          return;
        }
        throw e;
      }

      const commit = await api.post("/bootcamp/certificate/claim", {
        cohortId,
        attestationSignature: signature,
      });

      if (commit.data?.success && commit.data?.attestationUid) {
        setClaimData((prev) => ({
          ...prev,
          attestationUid: commit.data.attestationUid,
          attestationPending: false,
          attestationScanUrl: commit.data.attestationScanUrl ?? null,
        }));
        toast.success("Completion proof saved successfully!");
      } else {
        setClaimData((prev) => ({
          ...prev,
          attestationUid: null,
          attestationPending: true,
          attestationScanUrl: null,
        }));
        toast.error("Failed to save completion proof");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to retry completion proof");
    }
  };

  return {
    isClaiming,
    hasClaimed,
    claimError,
    claimData,
    claimCertificate,
    retryAttestation,
  };
}
