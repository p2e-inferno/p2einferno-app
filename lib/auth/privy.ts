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
 * Get user's wallet addresses from Privy API
 * @param userId Privy user ID (DID)
 * @returns Array of wallet addresses
 */
export async function getUserWalletAddresses(
  userId: string
): Promise<string[]> {
  try {
    const privy = getPrivyClient();
    const userProfile = await privy.getUser(userId);

    const walletAddresses: string[] = [];

    if (userProfile.linkedAccounts) {
      for (const account of userProfile.linkedAccounts) {
        if (account.type === "wallet" && account.address) {
          walletAddresses.push(account.address);
        }
      }
    }

    return walletAddresses;
  } catch (error) {
    console.error("Error fetching user wallet addresses:", error);
    return [];
  }
}

/**
 * Get authenticated Privy user from API request
 * @param req NextApiRequest object
 * @param includeWallets Whether to include wallet addresses (requires additional API call)
 * @returns User object if authenticated, null otherwise
 */
export async function getPrivyUser(
  req: NextApiRequest,
  includeWallets = false
) {
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

    const baseUser = {
      id: claims.userId,
      did: claims.userId,
      sessionId: claims.sessionId,
    };

    // If wallet addresses are requested, fetch them
    if (includeWallets) {
      const walletAddresses = await getUserWalletAddresses(claims.userId);
      return {
        ...baseUser,
        walletAddresses,
        wallet:
          walletAddresses.length > 0
            ? { address: walletAddresses[0] }
            : undefined,
      };
    }

    // The claims include userId (Privy DID). Return minimal user object
    return baseUser;
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
