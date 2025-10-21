/**
 * Client-Side EIP712 Signature Generation
 *
 * Used in the browser to sign withdrawal requests with the user's wallet.
 * The signature proves the user authorized this specific withdrawal.
 */

import { WITHDRAWAL_DOMAIN, WITHDRAWAL_TYPES, type WithdrawalMessage } from './types';

/**
 * Sign a withdrawal message using EIP712 typed data
 *
 * @param walletAddress User's wallet address
 * @param amountDG Amount in DG tokens (integer, not wei)
 * @param deadline Unix timestamp (seconds) when signature expires
 * @param signerProvider Privy wallet or ethers provider with signTypedData method
 * @returns EIP712 signature string
 */
export async function signWithdrawalMessage(
  walletAddress: `0x${string}`,
  amountDG: number,
  deadline: bigint,
  signerProvider: any // Privy wallet or ethers provider
): Promise<string> {
  // Convert DG amount to wei for signing (18 decimals)
  const amountWei = BigInt(amountDG) * BigInt(10 ** 18);

  const message: WithdrawalMessage = {
    user: walletAddress,
    amount: amountWei,
    deadline
  };

  // Use Privy's signTypedData or ethers provider
  const signature = await signerProvider.signTypedData({
    domain: WITHDRAWAL_DOMAIN,
    types: WITHDRAWAL_TYPES,
    primaryType: 'Withdrawal',
    message
  });

  return signature;
}
