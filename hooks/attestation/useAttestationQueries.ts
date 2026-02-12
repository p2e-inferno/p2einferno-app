/**
 * Hook for querying attestations with various filters
 * Migrated to React Query for automatic caching, deduplication, and background refetching
 */

import { useQuery } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import {
  getUserAttestations,
  getAttestationsBySchema,
  getUserAttestationCount,
  getUserDailyCheckinStreak,
  hasUserAttestationBySchemaKey,
  getSchemaStatistics,
} from "@/lib/attestation";
import { getLogger } from "@/lib/utils/logger";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

const log = getLogger("hooks:attestation:queries");

// Query key factory for type-safe cache invalidation
export const attestationQueryKeys = {
  all: ["attestations"] as const,
  userAttestations: (address?: string, options?: {
    schemaUid?: string;
    category?: string;
    limit?: number;
  }) => ["attestations", "user", address, options] as const,
  schemaAttestations: (schemaUid: string, limit?: number) =>
    ["attestations", "schema", schemaUid, limit] as const,
  userStats: (address?: string) =>
    ["attestations", "stats", "user", address] as const,
  schemaStats: (schemaUid: string) =>
    ["attestations", "stats", "schema", schemaUid] as const,
};

/**
 * Fetch attestations for a specific user with optional filters
 *
 * Features:
 * - Automatic caching (30s stale time)
 * - Request deduplication across components
 * - Optional auto-refresh every 30s
 * - Automatic retry on failure (2 retries with exponential backoff)
 *
 * @example
 * const { attestations, isLoading, error, refetch } = useUserAttestations(address, {
 *   schemaUid: '0x123...',
 *   autoRefresh: true,
 * });
 */
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
  const selectedWallet = useSmartWalletSelection();
  const address = userAddress || selectedWallet?.address || wallets[0]?.address;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: attestationQueryKeys.userAttestations(address, {
      schemaUid: options?.schemaUid,
      category: options?.category,
      limit: options?.limit,
    }),
    queryFn: async () => {
      if (!address) {
        log.debug("No address provided, skipping attestations fetch");
        return [];
      }

      log.debug("Fetching user attestations", { address, options });
      return getUserAttestations(address, options);
    },
    enabled: !!address, // Only run query when address is available
    staleTime: 1000 * 30, // Consider data fresh for 30 seconds
    gcTime: 1000 * 60 * 5, // Keep unused data in cache for 5 minutes
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchInterval: options?.autoRefresh ? 1000 * 30 : false, // Auto-refresh every 30s if enabled
    refetchOnWindowFocus: false, // Don't refetch when window regains focus (too aggressive)
  });

  return {
    attestations: data || [],
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch attestations") : null,
    refetch,
  };
};

/**
 * Fetch all attestations for a specific schema
 *
 * Features:
 * - Automatic caching (60s stale time - schema data changes less frequently)
 * - Request deduplication
 * - Automatic retry on failure
 *
 * @example
 * const { attestations, isLoading, error } = useSchemaAttestations('0x123...', 50);
 */
export const useSchemaAttestations = (schemaUid: string, limit?: number) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: attestationQueryKeys.schemaAttestations(schemaUid, limit),
    queryFn: async () => {
      if (!schemaUid) {
        log.debug("No schemaUid provided, skipping fetch");
        return [];
      }

      log.debug("Fetching schema attestations", { schemaUid, limit });
      return getAttestationsBySchema(schemaUid, { limit });
    },
    enabled: !!schemaUid,
    staleTime: 1000 * 60, // Schema attestations change less frequently
    gcTime: 1000 * 60 * 10,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: false,
  });

  return {
    attestations: data || [],
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch attestations") : null,
    refetch,
  };
};

/**
 * Fetch comprehensive stats for a user (count, streak, daily check-in status)
 *
 * Features:
 * - Parallel fetching of all stats via Promise.all
 * - Automatic caching (30s stale time)
 * - Request deduplication (if used in multiple components, only 1 request)
 * - Automatic retry on failure
 *
 * @example
 * const { stats, isLoading, error, refetch } = useUserAttestationStats(address);
 * console.log(stats.dailyCheckinStreak); // 5
 */
export const useUserAttestationStats = (userAddress?: string) => {
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection();
  const address = userAddress || selectedWallet?.address || wallets[0]?.address;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: attestationQueryKeys.userStats(address),
    queryFn: async () => {
      if (!address) {
        log.debug("No address provided, returning default stats");
        return {
          totalCount: 0,
          dailyCheckinStreak: 0,
          hasCheckedInToday: false,
        };
      }

      log.debug("Fetching user attestation stats", { address });

      // Fetch all stats in parallel
      const [totalCount, streak, hasCheckedIn] = await Promise.all([
        getUserAttestationCount(address),
        getUserDailyCheckinStreak(address),
        hasUserAttestationBySchemaKey(address, "daily_checkin"),
      ]);

      return {
        totalCount,
        dailyCheckinStreak: streak,
        hasCheckedInToday: hasCheckedIn,
      };
    },
    enabled: !!address,
    staleTime: 1000 * 30, // User stats can change frequently (check-ins, new attestations)
    gcTime: 1000 * 60 * 5,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: true, // Refetch on window focus to show up-to-date stats
  });

  return {
    stats: data || {
      totalCount: 0,
      dailyCheckinStreak: 0,
      hasCheckedInToday: false,
    },
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch stats") : null,
    refetch,
  };
};

/**
 * Fetch comprehensive statistics for a specific schema
 *
 * Features:
 * - Automatic caching (60s stale time - schema stats change less frequently)
 * - Request deduplication
 * - Automatic retry on failure
 *
 * @example
 * const { stats, isLoading } = useSchemaStats('0x123...');
 * console.log(stats.uniqueUsers); // 150
 */
export const useSchemaStats = (schemaUid: string) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: attestationQueryKeys.schemaStats(schemaUid),
    queryFn: async () => {
      if (!schemaUid) {
        log.debug("No schemaUid provided, returning default stats");
        return {
          totalCount: 0,
          uniqueUsers: 0,
          todayCount: 0,
          thisWeekCount: 0,
        };
      }

      log.debug("Fetching schema statistics", { schemaUid });
      return getSchemaStatistics(schemaUid);
    },
    enabled: !!schemaUid,
    staleTime: 1000 * 60, // Schema stats change less frequently
    gcTime: 1000 * 60 * 10,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: false,
  });

  return {
    stats: data || {
      totalCount: 0,
      uniqueUsers: 0,
      todayCount: 0,
      thisWeekCount: 0,
    },
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to fetch stats") : null,
    refetch,
  };
};
