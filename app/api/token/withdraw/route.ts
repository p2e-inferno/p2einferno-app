/**
 * POST /api/token/withdraw
 *
 * Main withdrawal endpoint that handles DG token withdrawals.
 *
 * Flow:
 * 1. Authenticate user (Privy)
 * 2. Check DG Nation NFT ownership (if configured)
 * 3. Verify EIP712 signature
 * 4. Check signature deadline
 * 5. Atomic DB operation (validates limits, deducts XP, creates withdrawal)
 * 6. Blockchain transfer
 * 7. On success: complete withdrawal
 * 8. On failure: rollback XP and mark failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyTypedData, recoverTypedDataAddress, hashTypedData, type Address } from 'viem';
import { createPublicClientUnified } from '@/lib/blockchain/config/clients/public-client';
import { createWalletClientUnified } from '@/lib/blockchain/config/clients/wallet-client';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { createAdminClient } from '@/lib/supabase/server';
import {
  transferDGTokens,
  hasValidDGNationKey
} from '@/lib/token-withdrawal/functions/dg-transfer-service';
import { getWithdrawalDomain, WITHDRAWAL_TYPES, DG_CONTRACTS_BY_CHAIN } from '@/lib/token-withdrawal/eip712/types';
import { getLogger } from '@/lib/utils/logger';
import {
  sendEmail,
  getWithdrawalEmail,
  getUserEmailContext,
  sendEmailWithDedup,
} from '@/lib/email';

const log = getLogger('api:token:withdraw');

// Token address is selected per-chain via DG_CONTRACTS_BY_CHAIN
const DG_NATION_LOCK = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request
    const { walletAddress, amountDG, signature, deadline, chainId: chainIdRaw } = await req.json();

    if (!walletAddress || !amountDG || !signature || !deadline) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create public client (needed for NFT check and transaction receipt)
    const publicClient = createPublicClientUnified();

    // 2. Check DG Nation membership (if required)
    if (DG_NATION_LOCK) {
      const hasAccess = await hasValidDGNationKey(
        publicClient,
        walletAddress as Address,
        DG_NATION_LOCK
      );

      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'DG Nation membership required' },
          { status: 403 }
        );
      }
    }

    // 3. Verify EIP712 signature
    const chainId = Number(chainIdRaw || 0);
    if (!chainId || !DG_CONTRACTS_BY_CHAIN[chainId]) {
      return NextResponse.json(
        { success: false, error: 'Unsupported or misconfigured chainId' },
        { status: 400 },
      );
    }
    const domain = getWithdrawalDomain(chainId);
    const amountWei = BigInt(amountDG) * BigInt(10 ** 18);
    const message = {
      user: walletAddress as Address,
      amount: amountWei,
      deadline: BigInt(deadline)
    };

    // Validation: ensure signature can be verified
    try {
      hashTypedData({
        address: walletAddress as Address,
        domain: { ...domain, chainId: BigInt(domain.chainId) },
        types: WITHDRAWAL_TYPES,
        primaryType: 'Withdrawal',
        message,
      } as any);
      await recoverTypedDataAddress({
        domain: { ...domain, chainId: BigInt(domain.chainId) },
        types: WITHDRAWAL_TYPES,
        primaryType: 'Withdrawal',
        message,
        signature: signature as `0x${string}`,
      });
    } catch (e) {
      log.warn('Failed to compute server typed data hash/recover', { e });
    }

    const isValid = await verifyTypedData({
      address: walletAddress as Address,
      domain: { ...domain, chainId: BigInt(domain.chainId) },
      types: WITHDRAWAL_TYPES,
      primaryType: 'Withdrawal',
      message,
      signature: signature as `0x${string}`
    });

    if (!isValid) {
      log.warn('Invalid signature', { user: user.id, walletAddress });
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 403 }
      );
    }

    // 4. Check deadline
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(deadline)) {
      return NextResponse.json(
        { success: false, error: 'Signature expired' },
        { status: 400 }
      );
    }

    // 5. Atomic DB operation (validates, deducts XP, creates withdrawal)
    const supabase = createAdminClient();
    const { data: withdrawalData, error: dbError } = await supabase.rpc(
      'initiate_withdrawal',
      {
        p_user_id: user.id,
        p_amount_dg: amountDG,
        p_signature: signature,
        p_deadline: deadline,
        p_wallet_address: walletAddress
      }
    );

    if (dbError || !withdrawalData?.success) {
      log.error('DB withdrawal initiation failed', { error: dbError, data: withdrawalData });
      return NextResponse.json(
        { success: false, error: withdrawalData?.error || 'Failed to initiate withdrawal' },
        { status: 400 }
      );
    }

    const withdrawalId = withdrawalData.withdrawal_id;

    // If idempotent (signature already used), return existing withdrawal
    if (withdrawalData.idempotent) {
      const { data: existing } = await supabase
        .from('dg_token_withdrawals')
        .select('status, transaction_hash')
        .eq('id', withdrawalId)
        .single();

      return NextResponse.json({
        success: true,
        idempotent: true,
        withdrawalId,
        status: existing?.status,
        transactionHash: existing?.transaction_hash
      });
    }

    // 6. Blockchain transfer
    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      await supabase.rpc('rollback_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_error_message: 'Server wallet not configured'
      });
      return NextResponse.json(
        { success: false, error: 'Server wallet not configured' },
        { status: 500 }
      );
    }

    try {
      const transferResult = await transferDGTokens(walletClient, publicClient, {
        recipientAddress: walletAddress as Address,
        amount: amountWei,
        tokenAddress: DG_CONTRACTS_BY_CHAIN[chainId] as `0x${string}`
      });

      if (transferResult.success && transferResult.transactionHash) {
        // 7. Complete withdrawal
        await supabase.rpc('complete_withdrawal', {
          p_withdrawal_id: withdrawalId,
          p_tx_hash: transferResult.transactionHash
        });

        log.info('Withdrawal completed', {
          userId: user.id,
          withdrawalId,
          txHash: transferResult.transactionHash,
          amountDG
        });

        try {
          const emailCtx = await getUserEmailContext(supabase, user.id);
          if (emailCtx?.email) {
            const tpl = getWithdrawalEmail({
              amount: Number(amountDG),
              txHash: transferResult.transactionHash,
              chainId,
            });

            await sendEmailWithDedup(
              'withdrawal-complete',
              withdrawalId,
              emailCtx.email,
              `withdrawal:${withdrawalId}`,
              () =>
                sendEmail({
                  to: emailCtx.email,
                  ...tpl,
                  tags: ['withdrawal'],
                }),
            );
          }
        } catch (emailErr) {
          log.error('Failed to send withdrawal email', {
            withdrawalId,
            emailErr,
          });
        }

        return NextResponse.json({
          success: true,
          withdrawalId,
          transactionHash: transferResult.transactionHash,
          amountDG
        });
      } else {
        // 8. Rollback on failure
        await supabase.rpc('rollback_withdrawal', {
          p_withdrawal_id: withdrawalId,
          p_error_message: transferResult.error || 'Transfer failed'
        });

        log.error('Blockchain transfer failed', {
          userId: user.id,
          withdrawalId,
          error: transferResult.error
        });

        return NextResponse.json(
          { success: false, error: transferResult.error || 'Transfer failed' },
          { status: 500 }
        );
      }
    } catch (blockchainError) {
      // Rollback on exception
      await supabase.rpc('rollback_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_error_message: blockchainError instanceof Error ? blockchainError.message : 'Unknown error'
      });

      log.error('Blockchain transfer exception', {
        userId: user.id,
        withdrawalId,
        error: blockchainError
      });

      return NextResponse.json(
        { success: false, error: 'Transfer failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    log.error('Withdrawal request failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
