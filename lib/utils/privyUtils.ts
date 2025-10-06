import { AuthTokenClaims, PrivyClient } from "@privy-io/server-auth";
import type { NextApiRequest, NextApiResponse } from "next";
import { getLogger } from "@/lib/utils/logger";

export interface APIError {
  error: string;
  cause?: string;
}

const log = getLogger("privyUtils");

/**
 * Authorizes a user to call an endpoint, returning either an error result or their verifiedClaims
 * @param req - The API request
 * @param res - The API response
 * @param client - A PrivyClient
 */
export const fetchAndVerifyAuthorization = async (
  req: NextApiRequest,
  res: NextApiResponse,
  client: PrivyClient,
): Promise<AuthTokenClaims | void> => {
  // Prefer Authorization: Bearer header, fall back to privy-token cookie.
  const header = req.headers.authorization || null;
  const cookieToken = (req as any)?.cookies?.["privy-token"] || null;

  const rawToken = header ? header.replace(/^Bearer /, "") : cookieToken;

  if (!rawToken) {
    return res.status(401).json({ error: "Missing auth token." });
  }

  try {
    return await client.verifyAuthToken(rawToken);
  } catch (e) {
    return res.status(401).json({ error: "Invalid auth token." });
  }
};

// Initialize PrivyClient at module level like working /api/verify.ts
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.NEXT_PRIVY_APP_SECRET;

// Create the client once at module initialization like working verify endpoint
let modulePrivyClient: PrivyClient | null = null;
try {
  if (PRIVY_APP_ID && PRIVY_APP_SECRET) {
    modulePrivyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
    log.info(
      "[PRIVY_MODULE] PrivyClient initialized successfully at module level",
    );
  } else {
    log.warn(
      "[PRIVY_MODULE] Missing Privy credentials - client not initialized",
    );
  }
} catch (error) {
  log.error(
    "[PRIVY_MODULE] Failed to initialize PrivyClient at module level:",
    error,
  );
  modulePrivyClient = null;
}

export const createPrivyClient = () => {
  if (!modulePrivyClient) {
    throw new Error(
      "PrivyClient not properly initialized. Check environment variables.",
    );
  }
  return modulePrivyClient;
};
