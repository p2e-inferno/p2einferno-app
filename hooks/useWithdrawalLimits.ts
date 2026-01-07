/**
 * Hook: useWithdrawalLimits
 *
 * Fetches dynamic withdrawal limits from the database configuration.
 * Provides fallback to default values if API fails.
 * Uses React Query for automatic caching and request deduplication.
 */

import { useQuery } from '@tanstack/react-query';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useWithdrawalLimits');

export interface WithdrawalLimits {
  minAmount: number;
  maxAmount: number;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_LIMITS = {
  minAmount: 3000,
  maxAmount: 100000
};

const fetchWithdrawalLimits = async (): Promise<{ minAmount: number; maxAmount: number }> => {
  const response = await fetch('/api/config/withdrawal-limits');
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch limits');
  }

  return {
    minAmount: data.limits.minAmount,
    maxAmount: data.limits.maxAmount
  };
};

/**
 * Fetches current withdrawal limits from API
 * Falls back to hardcoded defaults if API fails
 * Uses React Query for automatic caching and deduplication across multiple hook instances
 */
export function useWithdrawalLimits(): WithdrawalLimits {
  const { data, isLoading, error } = useQuery({
    queryKey: ['withdrawal-limits'],
    queryFn: fetchWithdrawalLimits,
    staleTime: 1000 * 60 * 5, // Consider data fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    refetchOnWindowFocus: false, // Config data doesn't change often
    placeholderData: DEFAULT_LIMITS, // Show defaults immediately while loading
  });

  // Use fetched data if available, otherwise use defaults
  const limits = data || DEFAULT_LIMITS;

  if (error) {
    log.error('Failed to fetch withdrawal limits, using defaults', { error });
  }

  return {
    minAmount: limits.minAmount,
    maxAmount: limits.maxAmount,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load limits') : null
  };
}
