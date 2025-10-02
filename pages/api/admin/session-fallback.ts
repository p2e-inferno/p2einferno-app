import type { NextApiRequest, NextApiResponse } from "next";
import { issueAdminSession } from "@/lib/auth/admin-session";
import { getPrivyUser } from "@/lib/auth/privy";
import { getUserWalletAddresses } from "@/lib/auth/privy";
import { createInfuraEthersAdapterReadClient } from "@/lib/blockchain/config";
import {
  checkMultipleWalletsForAdminKey,
  checkDevelopmentAdminAddress,
} from "@/lib/auth/admin-key-checker";
import { ADMIN_SESSION_TTL_SECONDS } from "@/lib/app-config/admin";

function setCookie(
  res: NextApiResponse,
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    path?: string;
    sameSite?: "lax" | "strict" | "none";
    expires?: Date;
  },
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`Path=${options.path || "/"}`);
  parts.push(
    `SameSite=${(options.sameSite || "lax").toString().replace(/^./, (c) => c.toUpperCase())}`,
  );
  res.setHeader("Set-Cookie", parts.join("; "));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getPrivyUser(req, false);
    if (!user)
      return res.status(401).json({ error: "Authentication required" });

    const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
    if (!adminLockAddress) {
      if (process.env.NODE_ENV === "development") {
        // Allow issuance in dev when lock not configured
        const { token, exp } = await issueAdminSession(
          { did: user.id, roles: ["admin"], locks: [] },
          ADMIN_SESSION_TTL_SECONDS,
        );
        const maxAge = exp - Math.floor(Date.now() / 1000);
        setCookie(res, "admin-session", token, {
          httpOnly: true,
          secure: (process.env.NODE_ENV as string) === "production",
          sameSite: "lax",
          path: "/",
          maxAge,
        });
        return res.status(200).json({ ok: true, exp });
      }
      return res.status(500).json({ error: "Admin lock not configured" });
    }

    const walletAddresses = await getUserWalletAddresses(user.id);
    if (
      (!walletAddresses || walletAddresses.length === 0) &&
      process.env.NODE_ENV === "development"
    ) {
      const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
      if (devAdminAddresses) {
        const devAddress = devAdminAddresses.split(",")[0]?.trim();
        if (devAddress) {
          const client = createInfuraEthersAdapterReadClient();
          const resDev = await checkDevelopmentAdminAddress(
            devAddress,
            adminLockAddress,
            client,
          );
          if (resDev.isValid) {
            const { token, exp } = await issueAdminSession(
              {
                did: user.id,
                wallet: devAddress,
                roles: ["admin"],
                locks: [adminLockAddress],
              },
              ADMIN_SESSION_TTL_SECONDS,
            );
            const maxAge = exp - Math.floor(Date.now() / 1000);
            setCookie(res, "admin-session", token, {
              httpOnly: true,
              secure: (process.env.NODE_ENV as string) === "production",
              sameSite: "lax",
              path: "/",
              maxAge,
            });
            return res.status(200).json({ ok: true, exp });
          }
        }
      }
    }

    if (!walletAddresses || walletAddresses.length === 0) {
      return res.status(403).json({ error: "No wallet addresses found" });
    }

    const client = createInfuraEthersAdapterReadClient();
    const keyRes = await checkMultipleWalletsForAdminKey(
      walletAddresses,
      adminLockAddress,
      client,
    );
    if (!keyRes?.hasValidKey) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { token, exp } = await issueAdminSession(
      {
        did: user.id,
        wallet: keyRes.validAddress,
        roles: ["admin"],
        locks: [adminLockAddress],
      },
      ADMIN_SESSION_TTL_SECONDS,
    );
    const maxAge = exp - Math.floor(Date.now() / 1000);
    setCookie(res, "admin-session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return res.status(200).json({ ok: true, exp });
  } catch (error: any) {
    return res.status(500).json({ error: "Server error" });
  }
}
