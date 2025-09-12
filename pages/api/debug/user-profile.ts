import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";
import { createClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:debug:user-profile");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type DebugResponse = {
  success: boolean;
  data?: {
    privyUser: any;
    privyWalletAddresses: string[];
    supabaseProfile: any;
    allSupabaseProfiles: any[];
  };
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DebugResponse>,
) {
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

    // Also get all profiles to see if there are multiple accounts
    const { data: allProfiles, error: allProfilesError } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id, email, wallet_address, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (allProfilesError) {
      log.info("[DEBUG] Error getting all profiles:", allProfilesError);
    } else {
      log.info("[DEBUG] Recent profiles count:", allProfiles?.length);
      allProfiles?.forEach((profile, i) => {
        log.info(`[DEBUG] Profile ${i + 1}:`, {
          privy_user_id: profile.privy_user_id,
          email: profile.email,
          wallet_address: profile.wallet_address,
          admin_role: profile.metadata?.role,
          created_at: profile.created_at,
        });
      });
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
        allSupabaseProfiles: allProfiles || [],
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
