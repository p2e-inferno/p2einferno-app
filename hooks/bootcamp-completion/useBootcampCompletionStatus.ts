import { useEffect, useState } from "react";
import axios from "axios";

interface CompletionStatus {
  isCompleted: boolean;
  completionDate: string | null;
  certificate: {
    issued: boolean;
    issuedAt: string | null;
    txHash: string | null;
    attestationUid: string | null;
    lastError: string | null;
    canRetryAttestation: boolean;
  };
  lockAddress: string | null;
}

export function useBootcampCompletionStatus(cohortId: string) {
  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      if (!cohortId) return;
      setIsLoading(true);
      setError(null);
      try {
        const resp = await axios.get(`/api/user/bootcamp/${cohortId}/completion-status`);
        if (!cancelled) setStatus(resp.data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load status");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [cohortId]);

  return { status, isLoading, error, refetch: () => setStatus(null) };
}

