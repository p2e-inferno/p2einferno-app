/**
 * GET /api/admin/wallet/balance
 *
 * Returns the server wallet's DG and ETH balances with alert thresholds.
 * Used for monitoring to ensure the server wallet has sufficient funds
 * for withdrawals and gas fees.
 */

import { NextResponse } from 'next/server';
import { createPublicClientUnified } from '@/lib/blockchain/config/clients/public-client';
import { getTokenBalance } from '@/lib/token-withdrawal/functions/dg-transfer-service';
import { privateKeyToAccount } from 'viem/accounts';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:wallet-balance');

export async function GET() {
  try {
    const publicClient = createPublicClientUnified();
    const tokenAddress = process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as `0x${string}`;
    const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY as `0x${string}`;

    if (!privateKey || !tokenAddress) {
      return NextResponse.json(
        { error: 'Server wallet not configured' },
        { status: 500 }
      );
    }

    const serverWallet = privateKeyToAccount(privateKey).address;

    // Get DG token balance
    const dgBalanceWei = await getTokenBalance(
      publicClient,
      tokenAddress,
      serverWallet
    );

    // Get native ETH balance for gas
    const ethBalance = await publicClient.getBalance({ address: serverWallet });

    const dgBalance = Number(dgBalanceWei / BigInt(10 ** 18));
    const ethBalanceFormatted = Number(ethBalance) / 10 ** 18;

    // Alert thresholds
    const DG_LOW_THRESHOLD = 10000; // Alert if < 10k DG
    const ETH_LOW_THRESHOLD = 0.01; // Alert if < 0.01 ETH

    const alerts = [];
    if (dgBalance < DG_LOW_THRESHOLD) {
      alerts.push({
        type: 'low_dg_balance',
        message: `DG balance is low: ${dgBalance} DG (threshold: ${DG_LOW_THRESHOLD})`,
        severity: 'warning' as const
      });
    }

    if (ethBalanceFormatted < ETH_LOW_THRESHOLD) {
      alerts.push({
        type: 'low_eth_balance',
        message: `ETH balance is low: ${ethBalanceFormatted.toFixed(4)} ETH (threshold: ${ETH_LOW_THRESHOLD})`,
        severity: 'critical' as const
      });
    }

    log.info('Server wallet balance checked', {
      dgBalance,
      ethBalance: ethBalanceFormatted,
      hasAlerts: alerts.length > 0
    });

    return NextResponse.json({
      success: true,
      balances: {
        dg: dgBalance,
        eth: ethBalanceFormatted,
        dgRaw: dgBalanceWei.toString(),
        ethRaw: ethBalance.toString()
      },
      thresholds: {
        dg: DG_LOW_THRESHOLD,
        eth: ETH_LOW_THRESHOLD
      },
      alerts,
      serverWallet
    });
  } catch (error) {
    log.error('Failed to check wallet balance', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to check balance' },
      { status: 500 }
    );
  }
}
