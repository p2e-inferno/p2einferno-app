import { NextApiRequest, NextApiResponse } from "next";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLockManagerAddress } from "@/lib/blockchain/server-config";
import { isServerBlockchainConfigured } from "@/lib/blockchain/server-config";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:server-wallet");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isServerBlockchainConfigured()) {
    return res
      .status(500)
      .json({ error: "Server blockchain is not configured." });
  }

  try {
    const serverWalletAddress = getLockManagerAddress();

    if (!serverWalletAddress) {
      // This should theoretically not be hit if isServerBlockchainConfigured is true,
      // but it's a good safeguard.
      return res
        .status(500)
        .json({ error: "Could not retrieve server wallet address." });
    }

    res.status(200).json({ serverWalletAddress });
  } catch (error: any) {
    log.error("Error fetching server wallet address:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
}

export default withAdminAuth(handler);
