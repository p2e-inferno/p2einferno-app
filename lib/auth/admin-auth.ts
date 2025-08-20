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
        return res.status(401).json({ error: "Authentication required" });
      }

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

      // 4. Check user's wallet addresses for admin key (blockchain-only)
      const walletAddresses = 'walletAddresses' in user ? user.walletAddresses : [];
      if (!walletAddresses || walletAddresses.length === 0) {
        // Fallback to DEV_ADMIN_ADDRESSES in development
        if (process.env.NODE_ENV === "development") {
          const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
          if (devAdminAddresses) {
            const devAddress = devAdminAddresses.split(",")[0]?.trim();
            if (devAddress) {
              const result = await checkDevelopmentAdminAddress(devAddress, adminLockAddress);
              if (result.isValid) {
                return handler(req, res);
              }
            }
          }
        }

        return res.status(403).json({ error: "No wallet addresses found" });
      }

      // 5. Check all wallets for valid admin key in parallel (performance optimization)
      const keyCheckResult = await checkMultipleWalletsForAdminKey(walletAddresses, adminLockAddress);
      
      if (keyCheckResult.hasValidKey) {
        return handler(req, res);
      }

      return res.status(403).json({ error: "Admin access required" });

    } catch (error: any) {
      const authError = handleAdminAuthError(error, 'key_verification', { userId: user?.id });
      const errorResponse = createErrorResponse(authError);
      
      return res.status(errorResponse.statusCode).json(errorResponse.body);
    }
  };
}
