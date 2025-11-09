import { useEffect, useState } from "react";
import api from "@/lib/helpers/api";
import { usePrivy } from "@privy-io/react-auth";

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
  const [refreshKey, setRefreshKey] = useState(0);
  const { getAccessToken } = usePrivy();

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      if (!cohortId) return;
      setIsLoading(true);
      setError(null);
      try {
        const token = await getAccessToken?.();
        const resp = await api.get(`/user/bootcamp/${cohortId}/completion-status`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
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
  }, [cohortId, refreshKey]);

  return { status, isLoading, error, refetch: () => setRefreshKey((k) => k + 1) };
}
