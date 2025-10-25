/**
 * Hook: useWithdrawalLimits
 *
 * Fetches dynamic withdrawal limits from the database configuration.
 * Provides fallback to default values if API fails.
 */

import { useState, useEffect } from 'react';
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

/**
 * Fetches current withdrawal limits from API
 * Falls back to hardcoded defaults if API fails
 */
export function useWithdrawalLimits() {
  const [limits, setLimits] = useState<WithdrawalLimits>({
    minAmount: DEFAULT_LIMITS.minAmount,
    maxAmount: DEFAULT_LIMITS.maxAmount,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    try {
      setLimits(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch('/api/config/withdrawal-limits');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch limits');
      }

      setLimits({
        minAmount: data.limits.minAmount,
        maxAmount: data.limits.maxAmount,
        isLoading: false,
        error: null
      });
    } catch (error) {
      log.error('Failed to fetch withdrawal limits, using defaults', { error });
      // Use defaults on error
      setLimits({
        minAmount: DEFAULT_LIMITS.minAmount,
        maxAmount: DEFAULT_LIMITS.maxAmount,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load limits'
      });
    }
  };

  return limits;
}
