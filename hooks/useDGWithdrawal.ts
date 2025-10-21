/**
 * Hook: useDGWithdrawal
 *
 * Main withdrawal orchestration hook that:
 * 1. Signs EIP712 withdrawal message
 * 2. Submits withdrawal request to API
 * 3. Tracks loading and error states
 */

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { signWithdrawalMessage } from '@/lib/token-withdrawal/eip712/client-signing';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useDGWithdrawal');

export interface WithdrawalResult {
  success: boolean;
  txHash?: string;
  withdrawalId?: string;
  error?: string;
}

export function useDGWithdrawal() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const initiateWithdrawal = async (amountDG: number): Promise<WithdrawalResult> => {
    try {
      setIsLoading(true);
      setError(null);
      setTxHash(null);

      if (!user || !wallets || wallets.length === 0) {
        throw new Error('Wallet not connected');
      }

      const wallet = wallets[0];
      if (!wallet?.address) {
        throw new Error('Wallet address not available');
      }
      const walletAddress = wallet.address;

      // 1. Calculate deadline (15 minutes from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);

      // 2. Sign EIP712 message
      const signature = await signWithdrawalMessage(
        walletAddress as `0x${string}`,
        amountDG,
        deadline,
        wallet // Privy wallet has signTypedData method
      );

      log.info('Withdrawal signature created', { amountDG, deadline: deadline.toString() });

      // 3. Submit to API
      const response = await fetch('/api/token/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          amountDG,
          signature,
          deadline: Number(deadline)
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Withdrawal failed');
      }

      setTxHash(data.transactionHash);
      log.info('Withdrawal successful', { txHash: data.transactionHash });

      return {
        success: true,
        txHash: data.transactionHash,
        withdrawalId: data.withdrawalId
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      log.error('Withdrawal failed', { error: err });
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    initiateWithdrawal,
    isLoading,
    error,
    txHash
  };
}
