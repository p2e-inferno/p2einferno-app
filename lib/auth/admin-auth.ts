import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { Address } from "viem";
import { lockManagerService } from "../blockchain/lock-manager";
import { PrivyClient } from "@privy-io/server-auth";

type NextApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => Promise<any>;

/**
 * Middleware to verify admin access using Unlock Protocol
 * This ensures only users with valid keys to the admin lock can access protected routes
 */
export function withAdminAuth(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // 1. Authenticate via Privy
      const user = await getPrivyUser(req);
      if (!user) {
        return res
          .status(401)
          .json({ error: "Unauthorized: Authentication required" });
      }

      // 2. Get admin lock address from environment variables
      const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;

      // 3. Development mode fallback if no lock address is provided
      if (!adminLockAddress) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, allowing all authenticated users as admins in development"
          );
          return handler(req, res);
        } else {
          return res
            .status(500)
            .json({ error: "Admin lock address not configured" });
        }
      }

      console.log(`[ADMIN AUTH] Checking admin access for user: ${user.id}`);
      console.log(`[ADMIN AUTH] Admin lock address: ${adminLockAddress}`);

      // 4. Get user's wallet addresses from Privy API
      console.log(`[ADMIN AUTH] Fetching user profile from Privy API...`);

      const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
      const appSecret = process.env.NEXT_PRIVY_APP_SECRET;

      if (!appId || !appSecret) {
        console.log(`[ADMIN AUTH] Missing Privy credentials`);
        return res.status(500).json({ error: "Server configuration error" });
      }

      const privyClient = new PrivyClient(appId, appSecret);

      try {
        // Fetch the user's full profile including linked accounts
        const userProfile = await privyClient.getUser(user.id);
        console.log(`[ADMIN AUTH] User profile fetched:`, {
          id: userProfile.id,
          linkedAccountsCount: userProfile.linkedAccounts?.length || 0,
        });

        // Extract wallet addresses from linked accounts
        const walletAddresses: string[] = [];

        if (userProfile.linkedAccounts) {
          for (const account of userProfile.linkedAccounts) {
            if (account.type === "wallet" && account.address) {
              walletAddresses.push(account.address);
              console.log(
                `[ADMIN AUTH] Found wallet address: ${account.address}`
              );
            }
          }
        }

        console.log(
          `[ADMIN AUTH] Total wallet addresses found: ${walletAddresses.length}`
        );

        if (walletAddresses.length === 0) {
          // Fallback to DEV_ADMIN_ADDRESSES in development
          if (process.env.NODE_ENV === "development") {
            const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
            if (devAdminAddresses) {
              const devAddress = devAdminAddresses.split(",")[0]?.trim();
              if (devAddress) {
                console.log(
                  `[ADMIN AUTH] Using DEV_ADMIN_ADDRESS: ${devAddress}`
                );

                const keyInfo = await lockManagerService.checkUserHasValidKey(
                  devAddress as Address,
                  adminLockAddress as Address
                );

                if (keyInfo && keyInfo.isValid) {
                  console.log(
                    `[ADMIN AUTH] Access GRANTED for dev address ${devAddress}`
                  );
                  return handler(req, res);
                }
              }
            }
          }

          console.log(
            `[ADMIN AUTH] No wallet addresses found for user ${user.id}`
          );
          return res
            .status(403)
            .json({ error: "Forbidden: No wallet addresses found" });
        }

        // 5. Check each wallet address for a valid admin key
        for (const walletAddress of walletAddresses) {
          console.log(
            `[ADMIN AUTH] Checking wallet ${walletAddress} for admin key...`
          );

          const keyInfo = await lockManagerService.checkUserHasValidKey(
            walletAddress as Address,
            adminLockAddress as Address
          );

          console.log(
            `[ADMIN AUTH] Key check result for ${walletAddress}:`,
            keyInfo
          );

          if (keyInfo && keyInfo.isValid) {
            console.log(
              `[ADMIN AUTH] Access GRANTED for user ${user.id} with wallet ${walletAddress}`
            );
            return handler(req, res);
          }
        }

        console.log(
          `[ADMIN AUTH] Access DENIED - no valid admin key found for any wallet addresses`
        );
        return res
          .status(403)
          .json({ error: "Forbidden: Admin access required" });
      } catch (privyError: any) {
        console.error(
          `[ADMIN AUTH] Error fetching user from Privy:`,
          privyError
        );
        return res.status(500).json({ error: "Error fetching user profile" });
      }
    } catch (error: any) {
      console.error("Admin auth error:", error);
      return res.status(500).json({
        error: "Internal server error during authorization",
      });
    }
  };
}
