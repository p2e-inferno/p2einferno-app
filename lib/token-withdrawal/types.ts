/**
 * TypeScript Type Definitions for DG Token Withdrawal Feature
 *
 * Shared types used across API endpoints, hooks, and components.
 */

/**
 * Request body for POST /api/token/withdraw
 */
export interface WithdrawRequest {
  walletAddress: string;
  amountDG: number; // DG amount as integer (e.g., 5000)
  signature: string; // EIP712 signature
  deadline: number; // Unix timestamp (seconds)
}

/**
 * Success response from POST /api/token/withdraw
 */
export interface WithdrawSuccessResponse {
  success: true;
  withdrawalId: string;
  transactionHash: string;
  amountDG: number;
  idempotent?: boolean; // True if signature was already used
}

/**
 * Error response from POST /api/token/withdraw
 */
export interface WithdrawErrorResponse {
  success: false;
  error: string;
}

/**
 * Combined response type
 */
export type WithdrawResponse = WithdrawSuccessResponse | WithdrawErrorResponse;

/**
 * Response from GET /api/token/withdraw/history
 */
export interface WithdrawalHistoryResponse {
  success: boolean;
  withdrawals: WithdrawalRecord[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Individual withdrawal record from database
 */
export interface WithdrawalRecord {
  id: string;
  user_id: string;
  user_profile_id: string | null;
  wallet_address: string;
  amount_dg: number;
  xp_balance_before: number;
  signature: string;
  deadline: number;
  transaction_hash: string | null;
  status: "pending" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Response from GET /api/admin/wallet/balance
 */
export interface WalletBalanceResponse {
  success: boolean;
  balances?: {
    dg: number;
    eth: number;
    dgRaw: string;
    ethRaw: string;
  };
  thresholds?: {
    dg: number;
    eth: number;
  };
  alerts?: Array<{
    type: string;
    message: string;
    severity: "warning" | "critical";
  }>;
  serverWallet?: string;
  error?: string;
}
