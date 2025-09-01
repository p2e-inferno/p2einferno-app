import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";

type ApiResponse = {
  success: boolean;
  walletAddresses?: string[];
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // Get authenticated user
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    // Get all wallet addresses for this user from Privy API
    const walletAddresses = await getUserWalletAddresses(user.id);

    return res.status(200).json({
      success: true,
      walletAddresses,
    });
  } catch (error) {
    console.error("Error fetching wallet addresses:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}