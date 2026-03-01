/**
 * Hook: useWithdrawalAccess
 *
 * Determines if user can withdraw DG tokens based on:
 * 1. DG Nation NFT ownership
 * 2. XP balance meeting minimum requirement
 */

import { useState, useEffect } from 'react';
import { useDGNationKey } from './useDGNationKey';

export interface WithdrawalAccessInfo {
  canWithdraw: boolean;
  reason: string | null;
  xpBalance: number;
  isLoading: boolean;
}

export interface WithdrawalAccessOptions {
  minAmount?: number;
  isLoadingLimits?: boolean;
}

/**
 * Hook to determine if user can withdraw DG tokens
 * Combines DG Nation NFT check + XP balance check
 * @param options.minAmount - Minimum withdrawal amount (defaults to 3000)
 * @param options.isLoadingLimits - Whether limits are still loading
 */
export function useWithdrawalAccess(options: WithdrawalAccessOptions = {}) {
  const { minAmount = 3000, isLoadingLimits = false } = options;
  const {
    hasValidKeyAnyLinked,
    isLoading: isLoadingKey,
    error: keyError,
  } = useDGNationKey();
  const [accessInfo, setAccessInfo] = useState<WithdrawalAccessInfo>({
    canWithdraw: false,
    reason: null,
    xpBalance: 0,
    isLoading: true
  });

  // Note: useApiCall doesn't support generics, so we fetch XP data manually
  const [xpData, setXpData] = useState<{ xp: number } | null>(null);
  const [isLoadingXp, setIsLoadingXp] = useState(true);
  const [xpError, setXpError] = useState<string | null>(null);

  // Fetch XP data
  useEffect(() => {
    const controller = new AbortController();

    async function fetchXP() {
      try {
        setIsLoadingXp(true);
        const response = await fetch('/api/user/experience-points', {
          signal: controller.signal,
        });
        const data = await response.json();

        if (response.ok && data.success) {
          setXpData({ xp: data.xp || 0 });
        } else {
          setXpError(data.error || 'Failed to fetch XP');
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setXpError(error instanceof Error ? error.message : 'Failed to fetch XP');
      } finally {
        setIsLoadingXp(false);
      }
    }

    fetchXP();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isLoadingKey || isLoadingXp || isLoadingLimits) {
      setAccessInfo(prev => ({ ...prev, isLoading: true }));
      return;
    }

    // First check NFT requirement
    if (!hasValidKeyAnyLinked) {
      setAccessInfo({
        canWithdraw: false,
        reason: keyError || 'DG Nation membership required to pull out DG tokens',
        xpBalance: xpData?.xp || 0,
        isLoading: false
      });
      return;
    }

    // Then check XP balance against dynamic minimum
    const hasEnoughXP = (xpData?.xp || 0) >= minAmount;

    setAccessInfo({
      canWithdraw: hasEnoughXP,
      reason: !hasEnoughXP ? `Minimum ${minAmount} DG required (current: ${xpData?.xp || 0})` : null,
      xpBalance: xpData?.xp || 0,
      isLoading: false
    });

  }, [
    hasValidKeyAnyLinked,
    isLoadingKey,
    isLoadingXp,
    isLoadingLimits,
    xpData,
    keyError,
    xpError,
    minAmount,
  ]);

  return accessInfo;
}
