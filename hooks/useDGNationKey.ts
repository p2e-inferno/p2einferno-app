/**
 * Hook: useDGNationKey
 *
 * Checks if the user has a valid DG Nation NFT and when it expires.
 * Reusable across components for access control.
 */

import { useState, useEffect } from 'react';
import { createViemPublicClient } from '@/lib/blockchain/providers/privy-viem';
import { useWallets } from '@privy-io/react-auth';
import { abi as lockAbi } from '@/constants/public_lock_abi';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useDGNationKey');

export interface DGNationKeyInfo {
  hasValidKey: boolean;
  expirationTimestamp: bigint | null;
  expiresAt: Date | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to check if user has a valid DG Nation NFT and when it expires
 * Reusable across components for access control
 */
export function useDGNationKey() {
  const { wallets } = useWallets();
  const [keyInfo, setKeyInfo] = useState<DGNationKeyInfo>({
    hasValidKey: false,
    expirationTimestamp: null,
    expiresAt: null,
    isLoading: true,
    error: null
  });

  const activeWallet = wallets?.[0]?.address;
  const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;

  useEffect(() => {
    if (!activeWallet || !lockAddress) {
      setKeyInfo(prev => ({
        ...prev,
        isLoading: false,
        error: !lockAddress ? 'DG Nation lock not configured' : !activeWallet ? 'No wallet connected' : null
      }));
      return;
    }

    async function checkKeyStatus() {
      try {
        setKeyInfo(prev => ({ ...prev, isLoading: true, error: null }));
        const publicClient = createViemPublicClient();

        // Check if user has valid key
        const hasKey = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'getHasValidKey',
          args: [activeWallet]
        });

        if (!hasKey) {
          setKeyInfo({
            hasValidKey: false,
            expirationTimestamp: null,
            expiresAt: null,
            isLoading: false,
            error: null
          });
          return;
        }

        // If user has key, get tokenId
        // First get user's balance
        const balance = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'balanceOf',
          args: [activeWallet]
        });

        if (Number(balance) === 0) {
          // This shouldn't happen if getHasValidKey returned true
          throw new Error('Key reported as valid but balance is 0');
        }

        // Get the first token ID
        const tokenId = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'tokenOfOwnerByIndex',
          args: [activeWallet, 0n] // Get first token
        });

        // Get expiration timestamp
        const expirationTimestamp = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'keyExpirationTimestampFor',
          args: [tokenId]
        }) as bigint;

        // Convert timestamp (in seconds) to Date
        const expiresAt = new Date(Number(expirationTimestamp) * 1000);

        setKeyInfo({
          hasValidKey: true,
          expirationTimestamp,
          expiresAt,
          isLoading: false,
          error: null
        });

      } catch (error) {
        log.error('Failed to check DG Nation key status', { error, wallet: activeWallet });
        setKeyInfo({
          hasValidKey: false,
          expirationTimestamp: null,
          expiresAt: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to check DG Nation status'
        });
      }
    }

    checkKeyStatus();
  }, [activeWallet, lockAddress]);

  return keyInfo;
}
