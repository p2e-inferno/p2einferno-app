import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import type { BootcampWithCohorts } from "@/lib/supabase/types";
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useBootcamps');


interface UseBootcampsResult {
  bootcamps: BootcampWithCohorts[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useBootcamps = (): UseBootcampsResult => {
  const [bootcamps, setBootcamps] = useState<BootcampWithCohorts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { authenticated, getAccessToken } = usePrivy();

  const fetchBootcamps = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build headers - include auth token if user is authenticated
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authenticated) {
        try {
          const token = await getAccessToken();
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
        } catch (tokenError) {
          log.warn("Could not get access token:", tokenError);
          // Continue without token for public data
        }
      }

      const response = await fetch("/api/bootcamps", {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch bootcamps");
      }

      const result = await response.json();
      setBootcamps(result.data || []);
    } catch (err: any) {
      log.error("Bootcamps fetch error:", err);
      setError(err.message);
      toast.error("Failed to load bootcamps");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBootcamps();
  }, [authenticated]);

  return {
    bootcamps,
    loading,
    error,
    refetch: fetchBootcamps,
  };
};