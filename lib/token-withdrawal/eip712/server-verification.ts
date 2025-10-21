/**
 * Server-Side EIP712 Signature Verification
 *
 * Verifies that a withdrawal signature was created by the claimed user.
 * Uses viem's verifyTypedData for cryptographic verification.
 */

import { verifyTypedData } from 'viem';
import { WITHDRAWAL_DOMAIN, WITHDRAWAL_TYPES, type WithdrawalMessage } from './types';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('eip712-verification');

export interface VerificationResult {
  valid: boolean;
  recoveredAddress?: `0x${string}`;
  error?: string;
}

/**
 * Verify an EIP712 withdrawal signature
 *
 * @param message The withdrawal message that was signed
 * @param signature The signature to verify
 * @returns Verification result with validity status
 */
export async function verifyWithdrawalSignature(
  message: WithdrawalMessage,
  signature: `0x${string}`
): Promise<VerificationResult> {
  try {
    const isValid = await verifyTypedData({
      address: message.user,
      domain: WITHDRAWAL_DOMAIN,
      types: WITHDRAWAL_TYPES,
      primaryType: 'Withdrawal',
      message,
      signature
    });

    if (isValid) {
      log.info('Signature verified successfully', { user: message.user });
      return { valid: true, recoveredAddress: message.user };
    } else {
      log.warn('Signature verification failed', { user: message.user });
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (error) {
    log.error('Signature verification error', { error, message });
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
