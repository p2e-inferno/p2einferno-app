/**
 * Hook: useRenewalStatus
 * Fetches user's renewal eligibility and status
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/hooks/useAuth';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hook:useRenewalStatus');

export interface RenewalStatusData {
  hasActiveKey: boolean;
  daysRemaining: number;
  currentExpiration: string;
  isRenewable: boolean;
  tokenId?: string;
  lockAddress?: string;
  crypto?: {
    available: boolean;
    keyPrice?: string;
    options?: Array<{ duration: number; cost: string }>;
  };
  xp?: {
    available: boolean;
    options?: Array<{ duration: number; cost: number; canAfford: boolean }>;
  };
  paystack?: {
    available: boolean;
    options?: Array<{ duration: number; costNgn: string }>;
  };
}

export const useRenewalStatus = () => {
  const { user } = useAuth('user');

  const query = useQuery<RenewalStatusData>({
    queryKey: ['renewal-status', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      try {
        const res = await fetch('/api/subscriptions/renewal-status');

        if (!res.ok) {
          throw new Error('Failed to fetch renewal status');
        }

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch renewal status');
        }

        log.info('Renewal status fetched', {
          hasKey: data.data?.hasActiveKey,
          daysRemaining: data.data?.daysRemaining,
        });

        return data.data as RenewalStatusData;
      } catch (error) {
        log.error('Error fetching renewal status', { error });
        throw error;
      }
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
    refetchOnWindowFocus: true,
  });

  return query;
};
