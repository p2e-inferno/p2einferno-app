import { NextApiRequest } from "next";
import { PrivyClient } from "@privy-io/server-auth";
import * as jose from "jose";
import { handleAuthError, handleJwtError, isNetworkError } from "./error-handler";

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
    // Get token from either Authorization header or privy-token cookie (like working verify endpoint)
    const headerAuthToken = req.headers.authorization?.replace(/^Bearer /, "");
    const cookieAuthToken = req.cookies["privy-token"];

    const token = cookieAuthToken || headerAuthToken;
    if (!token) {
      return null;
    }

    // Verify token with fallback strategy
    let claims: any;
    try {
      // First attempt: Privy API verification (recommended) with timeout
      const privy = getPrivyClient();
      if (!privy || typeof privy.verifyAuthToken !== 'function') {
        throw new Error('Privy client not properly initialized');
      }
      
      // Add timeout wrapper to fail faster and use JWT fallback sooner
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Privy API timeout after 3 seconds')), 3000);
      });
      
      claims = await Promise.race([
        privy.verifyAuthToken(token),
        timeoutPromise
      ]);
    } catch (error: any) {
      console.error('[PRIVY_AUTH] Raw error from verifyAuthToken:', error);
      const authError = handleAuthError(error, 'privy_token_verification', { 
        hasToken: !!token,
        errorType: error?.constructor?.name,
        errorMessage: error?.message 
      });
      
      // Check if this is a network/API error vs actual auth failure
      if (isNetworkError(error)) {
        console.warn(`[PRIVY_AUTH] API unavailable, attempting JWT fallback verification`);
        
        try {
          // Fallback: Local JWT verification using jose
          const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
          const verificationKey = process.env.PRIVY_VERIFICATION_KEY; // Server-accessible (no NEXT_ prefix)
          
          if (!verificationKey || !appId) {
            const configError = new Error('Missing JWT verification configuration');
            handleAuthError(configError, 'jwt_fallback_config', { hasVerificationKey: !!verificationKey, hasAppId: !!appId });
            return null;
          }

          // Import the ES256 public key
          const publicKey = await jose.importSPKI(verificationKey, "ES256");
          
          // Verify the JWT locally
          const { payload } = await jose.jwtVerify(token, publicKey, {
            issuer: "privy.io",
            audience: appId,
          });

          // Convert payload to expected claims format
          claims = {
            userId: payload.sub,
            sessionId: payload.sid,
            ...payload
          };
          
          console.log(`[PRIVY_AUTH] JWT fallback verification successful for user ${claims.userId}`);
        } catch (localVerifyError) {
          handleJwtError(localVerifyError, { fallbackAttempt: true, originalError: authError.code });
          return null;
        }
      } else {
        // Actual auth failure, not network issue
        console.log(`[PRIVY_AUTH] Token verification failed: ${authError.code}`);
        return null;
      }
    }

    if (!claims || !claims.userId) {
      return null;
    }

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
    
    // Add timeout wrapper to fail faster
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Privy API timeout after 3 seconds')), 3000);
    });
    
    const claims = await Promise.race([
      privy.verifyAuthToken(token),
      timeoutPromise
    ]);

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
