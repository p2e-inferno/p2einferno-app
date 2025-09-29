/**
 * Hook for querying attestations with various filters
 */

import { useState, useEffect } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  getUserAttestations,
  getAttestationsBySchema,
  getUserAttestationCount,
  getUserDailyCheckinStreak,
  hasUserAttestation,
  getSchemaStatistics,
  Attestation,
} from "@/lib/attestation";

export const useUserAttestations = (
  userAddress?: string,
  options?: {
    schemaUid?: string;
    category?: string;
    limit?: number;
    autoRefresh?: boolean;
  },
) => {
  const { wallets } = useWallets();
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const address = userAddress || wallets[0]?.address;

  const fetchAttestations = async () => {
    if (!address) {
      setAttestations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserAttestations(address, options);
      setAttestations(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch attestations",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttestations();
  }, [address, options?.schemaUid, options?.category, options?.limit]);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!options?.autoRefresh) return;

    const interval = setInterval(fetchAttestations, 30000);
    return () => clearInterval(interval);
  }, [options?.autoRefresh]);

  return {
    attestations,
    isLoading,
    error,
    refetch: fetchAttestations,
  };
};

export const useSchemaAttestations = (schemaUid: string, limit?: number) => {
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttestations = async () => {
    if (!schemaUid) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await getAttestationsBySchema(schemaUid, { limit });
      setAttestations(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch attestations",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttestations();
  }, [schemaUid, limit]);

  return {
    attestations,
    isLoading,
    error,
    refetch: fetchAttestations,
  };
};

export const useUserAttestationStats = (userAddress?: string) => {
  const { wallets } = useWallets();
  const [stats, setStats] = useState({
    totalCount: 0,
    dailyCheckinStreak: 0,
    hasCheckedInToday: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  const address = userAddress || wallets[0]?.address;

  const fetchStats = async () => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [totalCount, streak, hasCheckedIn] = await Promise.all([
        getUserAttestationCount(address),
        getUserDailyCheckinStreak(address),
        hasUserAttestation(address, "0xp2e_daily_checkin_001"),
      ]);

      setStats({
        totalCount,
        dailyCheckinStreak: streak,
        hasCheckedInToday: hasCheckedIn,
      });
    } catch (error) {
      console.error("Error fetching user stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [address]);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
};

export const useSchemaStats = (schemaUid: string) => {
  const [stats, setStats] = useState({
    totalCount: 0,
    uniqueUsers: 0,
    todayCount: 0,
    thisWeekCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = async () => {
    if (!schemaUid) return;

    setIsLoading(true);
    try {
      const data = await getSchemaStatistics(schemaUid);
      setStats(data);
    } catch (error) {
      console.error("Error fetching schema stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [schemaUid]);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
};
