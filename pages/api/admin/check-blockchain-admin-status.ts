import { NextApiRequest, NextApiResponse } from "next";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:check-blockchain-admin-status");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // User is already authenticated and admin access verified by middleware
    const user = (req as any).user;

    return res.status(200).json({
      success: true,
      hasAccess: true,
      strategy: "blockchain",
      userId: user.id,
      // Additional blockchain-specific data could be added here
    });
  } catch (error) {
    log.error("Blockchain admin status check error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default withAdminAuth(handler);
