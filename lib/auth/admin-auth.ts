import { NextApiRequest, NextApiResponse } from "next";

import { getPrivyUser } from "@/lib/auth/privy";
import { checkMultipleWalletsForAdminKey, checkDevelopmentAdminAddress } from "./admin-key-checker";
import { handleAdminAuthError, createErrorResponse } from "./error-handler";

type NextApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<any>;

/**
 * Blockchain-only admin authentication middleware
 * Uses getPrivyUser for JWT verification and blockchain for admin access control
 * Eliminates dependency on additional Privy API calls
 */
export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    let user: any = null;
    try {
      // 1. Get authenticated user and their wallets via getPrivyUser
      user = await getPrivyUser(req, true); // includeWallets = true
      if (!user) {
        console.log(`[BLOCKCHAIN_AUTH] Authentication failed - no valid JWT`);
        return res.status(401).json({ error: "Authentication required" });
      }

      console.log(`[BLOCKCHAIN_AUTH] User authenticated: ${user.id}`);

      // 2. Get admin lock address from environment variables
      const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;

      // 3. Development mode fallback if no lock address is provided
      if (!adminLockAddress) {
        if (process.env.NODE_ENV === "development") {
          console.warn("NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, allowing all authenticated users as admins in development");
          return handler(req, res);
        } else {
          return res.status(500).json({ error: "Admin lock address not configured" });
        }
      }

      console.log(`[BLOCKCHAIN_AUTH] Checking admin access for lock: ${adminLockAddress}`);

      // 4. Check user's wallet addresses for admin key (blockchain-only)
      const walletAddresses = 'walletAddresses' in user ? user.walletAddresses : [];
      if (!walletAddresses || walletAddresses.length === 0) {
        // Fallback to DEV_ADMIN_ADDRESSES in development
        if (process.env.NODE_ENV === "development") {
          const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
          if (devAdminAddresses) {
            const devAddress = devAdminAddresses.split(",")[0]?.trim();
            if (devAddress) {
              console.log(`[BLOCKCHAIN_AUTH] Using DEV_ADMIN_ADDRESS: ${devAddress}`);
              
              const result = await checkDevelopmentAdminAddress(devAddress, adminLockAddress);
              if (result.isValid) {
                console.log(`[BLOCKCHAIN_AUTH] ✅ Access GRANTED for dev address`);
                return handler(req, res);
              }
            }
          }
        }

        console.log(`[BLOCKCHAIN_AUTH] ❌ No wallet addresses found for user ${user.id}`);
        return res.status(403).json({ error: "No wallet addresses found" });
      }

      // 5. Check all wallets for valid admin key in parallel (performance optimization)
      const keyCheckResult = await checkMultipleWalletsForAdminKey(walletAddresses, adminLockAddress);
      
      if (keyCheckResult.hasValidKey) {
        console.log(`[BLOCKCHAIN_AUTH] ✅ Access GRANTED for wallet ${keyCheckResult.validAddress}`);
        return handler(req, res);
      }

      // Log any errors encountered during key checking
      if (keyCheckResult.errors.length > 0) {
        console.log(`[BLOCKCHAIN_AUTH] Encountered ${keyCheckResult.errors.length} errors during key validation`);
        keyCheckResult.errors.forEach(({ address, error }) => {
          console.error(`[BLOCKCHAIN_AUTH] Key check failed for ${address}: ${error}`);
        });
      }

      console.log(`[BLOCKCHAIN_AUTH] ❌ Access DENIED - no valid admin keys found`);
      return res.status(403).json({ error: "Admin access required" });

    } catch (error: any) {
      const authError = handleAdminAuthError(error, 'key_verification', { userId: user?.id });
      const errorResponse = createErrorResponse(authError);
      
      return res.status(errorResponse.statusCode).json(errorResponse.body);
    }
  };
}
