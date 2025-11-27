import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:debug:admin-auth-user");

type DebugResponse = {
  success: boolean;
  data?: {
    adminAuthUser: any;
    adminWalletAddresses: string[];
    requestHeaders: any;
    cookies: any;
  };
  error?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DebugResponse>,
) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, error: "Not found" });
  }

  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    log.info("=== ADMIN AUTH DEBUG ===");
    log.info("Request Headers:", JSON.stringify(req.headers, null, 2));
    log.info("Request Cookies:", JSON.stringify(req.cookies, null, 2));

    // Use EXACT same authentication as admin middleware
    const adminAuthUser = await getPrivyUser(req, true); // includeWallets = true
    if (!adminAuthUser) {
      log.info("[ADMIN_AUTH_DEBUG] No user found in admin auth");
      return res
        .status(401)
        .json({ success: false, error: "No user found via admin auth" });
    }

    log.info(
      "[ADMIN_AUTH_DEBUG] Admin Auth User:",
      JSON.stringify(adminAuthUser, null, 2),
    );

    // Get wallet addresses using same method as admin middleware
    const adminWalletAddresses = await getUserWalletAddresses(adminAuthUser.id);
    log.info(
      "[ADMIN_AUTH_DEBUG] Admin Wallet Addresses:",
      adminWalletAddresses,
    );

    return res.status(200).json({
      success: true,
      data: {
        adminAuthUser: {
          id: adminAuthUser.id,
          did: adminAuthUser.did,
          walletAddresses: (adminAuthUser as any)?.walletAddresses || [],
          wallet: (adminAuthUser as any)?.wallet,
          sessionId: adminAuthUser.sessionId,
        },
        adminWalletAddresses,
        requestHeaders: req.headers,
        cookies: req.cookies,
      },
    });
  } catch (error) {
    log.error("[ADMIN_AUTH_DEBUG] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export default withAdminAuth(handler);
