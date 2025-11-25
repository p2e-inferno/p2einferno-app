import type { NextApiResponse } from "next";
import { getLogger } from "@/lib/utils/logger";
import crypto from "crypto";

const log = getLogger("api:gooddollar-verify-callback");

export interface VerifyCallbackResponse {
  success: boolean;
  message: string;
  data?: {
    address: string;
    isWhitelisted: boolean;
    expiryTimestamp?: number;
  };
  error?: string;
}

// Generic response helper
export const sendResponse = (
  res: NextApiResponse<VerifyCallbackResponse>,
  statusCode: number,
  success: boolean,
  message: string,
  error?: string,
  data?: VerifyCallbackResponse["data"],
) => {
  res.status(statusCode).json({
    success,
    message,
    ...(error && { error }),
    ...(data && { data }),
  });
};

// Retry with exponential backoff
export const retryWithDelay = async <T>(
  fn: () => Promise<T>,
  attempts = 2,
  delayMs = 500,
): Promise<T> => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
};

// Decode status from base64 verified param
export const decodeStatusParam = (
  verifiedParam: string,
): string | undefined => {
  try {
    const decoded = Buffer.from(verifiedParam, "base64")
      .toString("utf-8")
      .toLowerCase();
    return decoded === "true" ? "success" : "failure";
  } catch (e) {
    log.warn("Failed to decode verified param", { verifiedParam, e });
    return undefined;
  }
};

// Extract status from params
export const extractStatus = (params: any): string | undefined => {
  const statusParam = params.status as string | undefined;
  if (statusParam) return statusParam;

  const verifiedParam = params.verified as string | undefined;
  return verifiedParam ? decodeStatusParam(verifiedParam) : undefined;
};

// Extract wallet address from Privy user
export const extractUserWallet = (privyUser: any): string | undefined => {
  if ("wallet" in privyUser && privyUser.wallet?.address) {
    return privyUser.wallet.address;
  }
  return "walletAddresses" in privyUser
    ? privyUser.walletAddresses?.[0]
    : undefined;
};

// Check if DB error is retryable
export const isRetryableDbError = (err: any): boolean => {
  if (!err) return false;
  const code = err.code || err.status;
  if (!code) return true;
  const numCode = Number(code);
  return numCode >= 500 || numCode === 0;
};

// Generate proof hash for audit trail
export const generateProofHash = (
  status: string,
  address: string,
  root?: any,
): string => {
  const proofData = JSON.stringify({
    status,
    address,
    timestamp: new Date().toISOString(),
    rootHash: root
      ? crypto.createHash("sha256").update(JSON.stringify(root)).digest("hex")
      : null,
  });
  return crypto.createHash("sha256").update(proofData).digest("hex");
};
