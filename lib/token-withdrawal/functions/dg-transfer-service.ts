/**
 * DG Token Transfer Service
 *
 * Pure functions for blockchain operations related to DG token withdrawals.
 * All functions accept blockchain clients as parameters for testability.
 */

import { type WalletClient, type PublicClient, type Address } from 'viem';
import { ERC20_ABI, COMPLETE_LOCK_ABI } from '@/lib/blockchain/shared/abi-definitions';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('dg-token-functions');

export interface DGTransferParams {
  recipientAddress: Address;
  amount: bigint; // Amount in wei (18 decimals for DG)
  tokenAddress: Address;
}

export interface DGTransferResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: bigint;
  error?: string;
}

/**
 * Transfer DG tokens from server wallet to user
 *
 * @param walletClient Initialized wallet client with signing capabilities
 * @param publicClient Initialized public client for reading transaction receipts
 * @param params Transfer parameters
 * @returns Transfer result with transaction hash or error
 */
export async function transferDGTokens(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: DGTransferParams
): Promise<DGTransferResult> {
  const { recipientAddress, amount, tokenAddress } = params;

  if (!walletClient) {
    return {
      success: false,
      error: 'Server wallet not configured'
    };
  }

  if (!walletClient.account) {
    return {
      success: false,
      error: 'Wallet account not available'
    };
  }

  try {
    log.info('Initiating DG token transfer', {
      recipient: recipientAddress,
      amount: amount.toString(),
      token: tokenAddress
    });

    // Execute ERC20 transfer
    const txHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipientAddress, amount],
      account: walletClient.account,
      chain: undefined // Chain is already set in wallet client
    });

    log.info('DG transfer transaction sent', { txHash });

    // Wait for confirmation (2 blocks)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2
    });

    if (receipt.status === 'success') {
      log.info('DG transfer confirmed', {
        txHash,
        blockNumber: receipt.blockNumber.toString()
      });

      return {
        success: true,
        transactionHash: txHash,
        blockNumber: receipt.blockNumber
      };
    } else {
      log.error('DG transfer reverted', { txHash, receipt });
      return {
        success: false,
        error: 'Transaction reverted on-chain'
      };
    }
  } catch (error) {
    log.error('DG transfer failed', { error, params });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check token balance for an address
 *
 * @param publicClient Initialized public client for read operations
 * @param tokenAddress ERC20 token contract address
 * @param walletAddress Address to check balance for
 * @returns Balance in wei (18 decimals)
 */
export async function getTokenBalance(
  publicClient: PublicClient,
  tokenAddress: Address,
  walletAddress: Address
): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress]
    }) as bigint;

    return balance;
  } catch (error) {
    log.error('Failed to get token balance', { error, tokenAddress, walletAddress });
    return 0n;
  }
}

/**
 * Check if wallet has a valid key in the DG Nation lock
 *
 * @param publicClient Initialized public client for read operations
 * @param walletAddress User wallet address to check
 * @param lockAddress DG Nation lock address
 * @returns True if user has valid NFT key
 */
export async function hasValidDGNationKey(
  publicClient: PublicClient,
  walletAddress: Address,
  lockAddress: Address
): Promise<boolean> {
  try {
    const hasKey = await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: 'getHasValidKey',
      args: [walletAddress]
    });

    return Boolean(hasKey);
  } catch (error) {
    log.error('Failed to check DG Nation key', { error, walletAddress, lockAddress });
    return false;
  }
}
