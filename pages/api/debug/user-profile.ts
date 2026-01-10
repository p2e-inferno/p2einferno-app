import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:debug:user-profile");

const supabase = createAdminClient();

type DebugResponse = {
  success: boolean;
  data?: {
    privyUser: any;
    privyWalletAddresses: string[];
    supabaseProfile: any;
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
    // Get authenticated user from Privy
    const privyUser = await getPrivyUser(req, true); // includeWallets = true
    if (!privyUser) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    log.info("[DEBUG] Privy User:", JSON.stringify(privyUser, null, 2));

    // Get wallet addresses from Privy API
    const privyWalletAddresses = await getUserWalletAddresses(privyUser.id);
    log.info("[DEBUG] Privy Wallet Addresses:", privyWalletAddresses);

    // Query Supabase for user profile by Privy ID (correct table: user_profiles)
    const { data: supabaseProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("privy_user_id", privyUser.id)
      .single();

    if (profileError) {
      log.info("[DEBUG] Supabase profile error:", profileError);
    } else {
      log.info(
        "[DEBUG] Supabase Profile:",
        JSON.stringify(supabaseProfile, null, 2),
      );
    }

    // Check if user is a database admin using the is_admin function
    let isDatabaseAdmin = false;
    if (supabaseProfile?.id) {
      const { data: adminCheck, error: adminError } = await supabase.rpc(
        "is_admin",
        { user_id: supabaseProfile.id },
      );

      if (adminError) {
        log.info("[DEBUG] Admin check error:", adminError);
      } else {
        isDatabaseAdmin = adminCheck || false;
        log.info("[DEBUG] Is database admin:", isDatabaseAdmin);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        privyUser: {
          id: privyUser.id,
          did: privyUser.did,
          walletAddresses: (privyUser as any)?.walletAddresses || [],
          wallet: (privyUser as any)?.wallet,
          sessionId: privyUser.sessionId,
        },
        privyWalletAddresses,
        supabaseProfile,
      },
    });
  } catch (error) {
    log.error("[DEBUG] Error in debug endpoint:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}

export default withAdminAuth(handler);
