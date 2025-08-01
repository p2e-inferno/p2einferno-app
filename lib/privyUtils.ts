import { AuthTokenClaims, PrivyClient } from "@privy-io/server-auth";
import type { NextApiRequest, NextApiResponse } from "next";

export type APIError = {
  error: string;
  cause?: string;
};

/**
 * Authorizes a user to call an endpoint, returning either an error result or their verifiedClaims
 * @param req - The API request
 * @param res - The API response
 * @param client - A PrivyClient
 */
export const fetchAndVerifyAuthorization = async (
  req: NextApiRequest,
  res: NextApiResponse,
  client: PrivyClient
): Promise<AuthTokenClaims | void> => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: "Missing auth token." });
  }
  const authToken = header.replace(/^Bearer /, "");

  try {
    return client.verifyAuthToken(authToken);
  } catch {
    return res.status(401).json({ error: "Invalid auth token." });
  }
};

export const createPrivyClient = () => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.NEXT_PRIVY_APP_SECRET;

  if (!appId) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID environment variable is required"
    );
  }

  if (!appSecret) {
    throw new Error("NEXT_PRIVY_APP_SECRET environment variable is required");
  }

  try {
    return new PrivyClient(appId, appSecret);
  } catch (error) {
    console.error("Failed to create PrivyClient:", error);
    throw new Error(`PrivyClient initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
