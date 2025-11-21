/**
 * Hook: useXpRenewal
 * Manages XP-based renewal flow with state management
 */

'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getLogger } from '@/lib/utils/logger';
import toast from 'react-hot-toast';

const log = getLogger('hook:useXpRenewal');

export interface XpRenewalState {
  isLoading: boolean;
  step: 'quote' | 'confirming' | 'complete';
  quote?: {
    baseCost: number;
    serviceFee: number;
    total: number;
    canAfford: boolean;
    userBalance: number;
  };
  error?: string;
  newExpiration?: Date;
  renewalAttemptId?: string;
  transactionHash?: string;
}

export const useXpRenewal = () => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<XpRenewalState>({
    isLoading: false,
    step: 'quote',
  });

  /**
   * Fetch quote for specific duration
   */
  const getQuote = useCallback(
    async (duration: 30 | 90 | 365) => {
      setState((s) => ({ ...s, isLoading: true, error: undefined }));

      try {
        const res = await fetch(
          `/api/subscriptions/xp-renewal-quote?duration=${duration}`
        );
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch quote');
        }

        log.info('Quote fetched successfully', {
          duration,
          cost: data.data.totalCost,
          canAfford: data.data.canAfford,
        });

        setState((s) => ({
          ...s,
          isLoading: false,
          quote: {
            baseCost: data.data.baseCost,
            serviceFee: data.data.serviceFee,
            total: data.data.totalCost,
            canAfford: data.data.canAfford,
            userBalance: data.data.userXpBalance,
          },
          step: 'confirming',
        }));
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to get quote';
        log.error('Quote fetch failed', { error, duration });
        setState((s) => ({
          ...s,
          isLoading: false,
          error: errorMsg,
        }));
        toast.error(errorMsg);
      }
    },
    []
  );

  /**
   * Execute renewal with XP
   */
  const executeRenewal = useCallback(
    async (duration: 30 | 90 | 365) => {
      setState((s) => ({ ...s, isLoading: true, error: undefined }));

      try {
        const res = await fetch('/api/subscriptions/renew-with-xp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration }),
        });

        const data = await res.json();

        if (!data.success) {
          // Check if recoverable
          if (data.recovery) {
            log.warn('Renewal failed with recovery info', {
              error: data.error,
              recovery: data.recovery,
            });

            setState((s) => ({
              ...s,
              isLoading: false,
              error: data.error,
              renewalAttemptId: data.recovery.renewalAttemptId,
            }));

            toast.error(data.error);
          } else {
            throw new Error(data.error || 'Renewal failed');
          }
          return;
        }

        // Success
        log.info('Renewal successful', {
          newExpiration: data.data.newExpiration,
          txHash: data.data.transactionHash,
        });

        const newDate = new Date(data.data.newExpiration);
        setState((s) => ({
          ...s,
          isLoading: false,
          step: 'complete',
          newExpiration: newDate,
          transactionHash: data.data.transactionHash,
          renewalAttemptId: undefined, // Clear recovery info
        }));

        toast.success('Subscription renewed successfully!');

        // Invalidate related queries
        await queryClient.invalidateQueries({
          queryKey: ['renewal-status'],
        });
        await queryClient.invalidateQueries({
          queryKey: ['user-profile'],
        });
      } catch (error: any) {
        const errorMsg = error.message || 'Renewal failed';
        log.error('Renewal execution failed', { error, duration });
        setState((s) => ({
          ...s,
          isLoading: false,
          error: errorMsg,
        }));
        toast.error(errorMsg);
      }
    },
    [queryClient]
  );

  /**
   * Retry failed renewal
   */
  const retry = useCallback(
    async (duration: 30 | 90 | 365) => {
      log.info('Retrying renewal', { duration });
      await executeRenewal(duration);
    },
    [executeRenewal]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      step: 'quote',
      error: undefined,
      quote: undefined,
      newExpiration: undefined,
      renewalAttemptId: undefined,
      transactionHash: undefined,
    });
  }, []);

  return {
    ...state,
    getQuote,
    executeRenewal,
    retry,
    reset,
  };
};
