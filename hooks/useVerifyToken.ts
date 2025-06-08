import { useState, useCallback } from "react";
import { getAccessToken } from "@privy-io/react-auth";

export function useVerifyToken() {
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = "/api/verify";
      const accessToken = await getAccessToken();
      const result = await fetch(url, {
        headers: {
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined),
        },
      });
      const data = await result.json();
      setVerifyResult(data);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { verifyResult, loading, error, verifyToken };
}
