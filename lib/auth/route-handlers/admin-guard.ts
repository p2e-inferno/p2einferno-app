import { NextRequest, NextResponse } from "next/server";
import {
  getAdminTokenFromRequest,
  verifyAdminSession,
} from "@/lib/auth/admin-session";
import {
  getPrivyUserFromNextRequest,
  getUserWalletAddresses,
} from "@/lib/auth/privy";
import {createPublicClientUnified} from "@/lib/blockchain/config";
import {
  checkMultipleWalletsForAdminKey,
  checkDevelopmentAdminAddress,
} from "@/lib/auth/admin-key-checker";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("auth:route-guard");

/**
 * Route Handler guard to enforce admin authentication consistently with Pages API `withAdminAuth`.
 * - Accepts a valid `admin-session` JWT (cookie or Authorization header)
 * - Otherwise verifies Privy token and checks on-chain admin lock for any wallet
 * - In development, supports DEV_ADMIN_ADDRESSES fallback when lock is unset
 *
 * Returns a NextResponse on failure; returns null when access is granted.
 */
export async function ensureAdminOrRespond(
  req: NextRequest,
): Promise<NextResponse | null> {
  try {
    const method = req.method?.toUpperCase?.() || "GET";

    // Read any admin-session token (may be used for wallet binding check)
    let jwtWallet: string | null = null;
    let hasJwt = false;
    try {
      const token = getAdminTokenFromRequest(req as any);
      if (token) {
        const payload: any = await verifyAdminSession(token);
        const roles: string[] = Array.isArray(payload?.roles)
          ? payload.roles
          : [];
        if (payload?.admin === true || roles.includes("admin")) {
          hasJwt = true;
          jwtWallet = (payload?.wallet || "").toString().toLowerCase() || null;
        } else {
          log.warn("route-guard: JWT present but missing admin role");
        }
      }
    } catch (e: any) {
      log.warn(
        "route-guard: JWT verification failed; continuing with Privy + on-chain checks",
        { error: e?.message },
      );
      hasJwt = false;
      jwtWallet = null;
    }

    // Privy user (auth required)
    const user = await getPrivyUserFromNextRequest(req, false);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    // 3) Admin lock config
    const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
    if (!adminLockAddress) {
      if (process.env.NODE_ENV === "development") {
        log.warn("Admin lock not set; allowing admin in dev");
        return null;
      }
      return NextResponse.json(
        { error: "Admin lock not configured" },
        { status: 500 },
      );
    }

    // 4) Wallets from Privy profile
    const walletAddresses: string[] = await getUserWalletAddresses(user.id);
    if (
      (!walletAddresses || walletAddresses.length === 0) &&
      process.env.NODE_ENV === "development"
    ) {
      const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
      if (devAdminAddresses) {
        const devAddress = devAdminAddresses.split(",")[0]?.trim();
        if (devAddress) {
          const client = createPublicClientUnified();
          const res = await checkDevelopmentAdminAddress(
            devAddress,
            adminLockAddress,
            client,
          );
          if (res.isValid) return null;
        }
      }
    }

    if (!walletAddresses || walletAddresses.length === 0) {
      return NextResponse.json(
        { error: "No wallet addresses found" },
        { status: 403 },
      );
    }

    // 5) Determine active wallet from header (preferred)
    const activeHeader = req.headers.get("x-active-wallet") || "";
    const activeWallet = activeHeader ? activeHeader.toLowerCase() : "";

    // For mutating requests, require active wallet and strict binding
    if (method !== "GET") {
      if (!activeWallet) {
        return NextResponse.json(
          { error: "Active wallet required" },
          { status: 428 },
        );
      }
      if (!walletAddresses.map((w) => w.toLowerCase()).includes(activeWallet)) {
        return NextResponse.json(
          { error: "Active wallet not linked to user" },
          { status: 403 },
        );
      }
      const client = createPublicClientUnified();
      const keyRes = await checkMultipleWalletsForAdminKey(
        [activeWallet],
        adminLockAddress,
        client,
      );
      if (!keyRes?.hasValidKey) {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      if (hasJwt && jwtWallet && jwtWallet !== activeWallet) {
        // Force session rotation on the client
        return NextResponse.json(
          { error: "Session wallet mismatch" },
          { status: 401 },
        );
      }
      return null;
    }

    // For reads (GET): allow with either active wallet checks or fallback to any valid key
    if (activeWallet) {
      if (!walletAddresses.map((w) => w.toLowerCase()).includes(activeWallet)) {
        return NextResponse.json(
          { error: "Active wallet not linked to user" },
          { status: 403 },
        );
      }
      const client = createPublicClientUnified();
      const keyRes = await checkMultipleWalletsForAdminKey(
        [activeWallet],
        adminLockAddress,
        client,
      );
      if (!keyRes?.hasValidKey) {
        return NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        );
      }
      if (hasJwt && jwtWallet && jwtWallet !== activeWallet) {
        return NextResponse.json(
          { error: "Session wallet mismatch" },
          { status: 401 },
        );
      }
      return null;
    }

    // No active wallet header: permit only if user still holds a valid admin key on any linked wallet
    const client = createPublicClientUnified();
    const keyRes = await checkMultipleWalletsForAdminKey(
      walletAddresses,
      adminLockAddress,
      client,
    );
    if (!keyRes?.hasValidKey) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }
    return null;
  } catch (error: any) {
    log.error("route-guard error", { error });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
