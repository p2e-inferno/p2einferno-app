import { NextApiRequest, NextApiResponse } from "next";

import { getPrivyUser } from "@/lib/auth/privy";
import {
  verifyAdminSession,
  getAdminTokenFromNextApiRequest,
} from "@/lib/auth/admin-session";
import { createInfuraEthersAdapterReadClient } from "@/lib/blockchain/config";
import {
  checkMultipleWalletsForAdminKey,
  checkDevelopmentAdminAddress,
} from "./admin-key-checker";
import { handleAdminAuthError, createErrorResponse } from "./error-handler";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("auth:admin");

type NextApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
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
      const method = (req.method || "GET").toUpperCase();

      // Strict binding mode: do not trust JWT without wallet validation
      let hasJwt = false;
      let jwtWallet: string | null = null;
      try {
        const adminToken = getAdminTokenFromNextApiRequest(req);
        if (adminToken) {
          const payload: any = await verifyAdminSession(adminToken);
          const roles: string[] = Array.isArray(payload?.roles)
            ? payload.roles
            : [];
          if (payload?.admin === true || roles.includes("admin")) {
            hasJwt = true;
            jwtWallet =
              (payload?.wallet || "").toString().toLowerCase() || null;
          } else {
            log.warn(
              "withAdminAuth: admin-session present but missing admin role",
            );
          }
        }
      } catch (e: any) {
        log.warn(
          "withAdminAuth: admin-session verification failed; continuing with Privy + on-chain checks",
          { error: e?.message },
        );
      }

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
          log.warn(
            "NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, allowing all authenticated users as admins in development",
          );
          return handler(req, res);
        } else {
          return res
            .status(500)
            .json({ error: "Admin lock address not configured" });
        }
      }

      // 4. Check user's wallet addresses for admin key (blockchain-only)
      const walletAddresses =
        "walletAddresses" in user ? user.walletAddresses : [];
      if (!walletAddresses || walletAddresses.length === 0) {
        // Fallback to DEV_ADMIN_ADDRESSES in development
        if (process.env.NODE_ENV === "development") {
          const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
          if (devAdminAddresses) {
            const devAddress = devAdminAddresses.split(",")[0]?.trim();
            if (devAddress) {
              const client = createInfuraEthersAdapterReadClient();
              const result = await checkDevelopmentAdminAddress(
                devAddress,
                adminLockAddress,
                client,
              );
              if (result.isValid) {
                return handler(req, res);
              }
            }
          }
        }

        return res.status(403).json({ error: "No wallet addresses found" });
      }

      // 5. Determine active wallet header (optional for GET, required for writes)
      const activeHeader = (req.headers["x-active-wallet"] ||
        req.headers["X-Active-Wallet"] ||
        "") as string;
      const activeWallet = activeHeader
        ? activeHeader.toString().toLowerCase()
        : "";

      if (method !== "GET") {
        if (!activeWallet)
          return res.status(428).json({ error: "Active wallet required" });
        if (
          !walletAddresses
            .map((w: string) => w.toLowerCase())
            .includes(activeWallet)
        ) {
          return res
            .status(403)
            .json({ error: "Active wallet not linked to user" });
        }
        const client = createInfuraEthersAdapterReadClient();
        const keyRes = await checkMultipleWalletsForAdminKey(
          [activeWallet],
          adminLockAddress,
          client,
        );
        if (!keyRes?.hasValidKey)
          return res.status(403).json({ error: "Admin access required" });
        if (hasJwt && jwtWallet && jwtWallet !== activeWallet) {
          return res.status(401).json({ error: "Session wallet mismatch" });
        }
        return handler(req, res);
      }

      // GET: allow with active wallet or any valid key fallback
      if (activeWallet) {
        if (
          !walletAddresses
            .map((w: string) => w.toLowerCase())
            .includes(activeWallet)
        ) {
          return res
            .status(403)
            .json({ error: "Active wallet not linked to user" });
        }
        const client = createInfuraEthersAdapterReadClient();
        const keyRes = await checkMultipleWalletsForAdminKey(
          [activeWallet],
          adminLockAddress,
          client,
        );
        if (!keyRes?.hasValidKey)
          return res.status(403).json({ error: "Admin access required" });
        if (hasJwt && jwtWallet && jwtWallet !== activeWallet) {
          return res.status(401).json({ error: "Session wallet mismatch" });
        }
        return handler(req, res);
      }

      const client = createInfuraEthersAdapterReadClient();
      const keyCheckResult = await checkMultipleWalletsForAdminKey(
        walletAddresses,
        adminLockAddress,
        client,
      );
      if (keyCheckResult.hasValidKey) return handler(req, res);
      return res.status(403).json({ error: "Admin access required" });
    } catch (error: any) {
      const authError = handleAdminAuthError(error, "key_verification", {
        userId: user?.id,
      });
      const errorResponse = createErrorResponse(authError);

      return res.status(errorResponse.statusCode).json(errorResponse.body);
    }
  };
}
