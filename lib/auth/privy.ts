import { NextApiRequest } from "next";
import { PrivyClient } from "@privy-io/server-auth";

// Initialize Privy client with app ID and secret
const getPrivyClient = () => {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.NEXT_PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "Missing Privy credentials. Please check your environment variables."
    );
  }

  return new PrivyClient(appId, appSecret);
};

/**
 * Get authenticated Privy user from API request
 * @param req NextApiRequest object
 * @returns User object if authenticated, null otherwise
 */
export async function getPrivyUser(req: NextApiRequest) {
  try {
    // Get authorization header from request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    // Extract token from header
    const token = authHeader.split(" ")[1];
    if (!token) {
      return null;
    }

    // Verify token with Privy
    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    // The claims include userId (Privy DID). Return minimal user object
    return {
      id: claims.userId,
      did: claims.userId,
      sessionId: claims.sessionId,
    };
  } catch (error) {
    console.error("Error verifying Privy token:", error);
    return null;
  }
}

/**
 * Get authenticated user from cookies (for server components/actions)
 * @param cookies Cookies object from Next.js
 * @returns User object if authenticated, null otherwise
 */
export async function getPrivyUserFromCookies(cookies: any) {
  try {
    const token = cookies.get("privy-token")?.value;
    if (!token) {
      return null;
    }

    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    return {
      id: claims.userId,
      did: claims.userId,
      sessionId: claims.sessionId,
    };
  } catch (error) {
    console.error("Error verifying Privy token from cookies:", error);
    return null;
  }
}
