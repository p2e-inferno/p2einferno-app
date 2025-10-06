import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:debug");

/**
 * Debug endpoint to help diagnose admin setup issues
 * Only available in development mode
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Authenticate via Privy
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(200).json({
        debug: "Admin Debug Information",
        authenticated: false,
        error: "No authenticated user found",
        suggestions: [
          "Make sure you're logged in with Privy",
          "Check that your wallet is connected",
          "Try logging out and back in",
        ],
      });
    }

    const supabase = createAdminClient();

    // Check user profile
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, wallet_address, metadata, linked_wallets, privy_user_id")
      .eq("privy_user_id", user.id)
      .single();

    // Check admin function
    let adminDbCheck = null;
    let adminErr = null;
    if (userProfile) {
      const { data: adminResult, error } = await supabase.rpc("is_admin", {
        user_id: userProfile.id,
      });
      adminDbCheck = adminResult;
      adminErr = error;
    }

    // Check environment variables
    const envCheck = {
      hasDevAdminAddresses: !!process.env.DEV_ADMIN_ADDRESSES,
      devAdminAddresses: process.env.DEV_ADMIN_ADDRESSES
        ? process.env.DEV_ADMIN_ADDRESSES.split(",").map((a) => a.trim())
        : null,
      hasAdminLockAddress: !!process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS,
    };

    // Get current wallet addresses from Privy API
    const userWalletAddresses = await getUserWalletAddresses(user.id);
    const currentWallet =
      userWalletAddresses.length > 0 ? userWalletAddresses[0] : null;

    // Check if current wallet is in dev admin list
    const allUserWallets = [
      ...userWalletAddresses.map((w) => w.toLowerCase()),
      userProfile?.wallet_address?.toLowerCase(),
      ...(userProfile?.linked_wallets || []).map((w: any) => w.toLowerCase()),
    ].filter(Boolean);

    // Remove duplicates
    const uniqueUserWallets = [...new Set(allUserWallets)];

    const isDevAdmin =
      envCheck.devAdminAddresses?.some((devAdmin) =>
        uniqueUserWallets.some((wallet) => wallet === devAdmin.toLowerCase()),
      ) || false;

    const debugInfo = {
      debug: "Admin Debug Information",
      timestamp: new Date().toISOString(),
      user: {
        privyId: user.id,
        currentWallet,
        privyWallets: userWalletAddresses,
        hasWallet: userWalletAddresses.length > 0,
      },
      profile: {
        exists: !!userProfile,
        id: userProfile?.id,
        walletAddress: userProfile?.wallet_address,
        linkedWallets: userProfile?.linked_wallets,
        error: profileError?.message,
      },
      adminChecks: {
        databaseResult: adminDbCheck,
        databaseError: adminErr?.message,
        isDevAdmin,
        environmentCheck: envCheck,
      },
      recommendations: [] as string[],
    };

    // Generate recommendations
    if (!userProfile) {
      debugInfo.recommendations.push(
        "User profile not found in database - this needs to be created",
        "Try visiting /lobby first to create your profile",
        "Contact admin to manually create your profile",
      );
    }

    if (!adminDbCheck && !isDevAdmin) {
      debugInfo.recommendations.push(
        "No admin permissions found in database or dev list",
        "Add your wallet to DEV_ADMIN_ADDRESSES environment variable",
        "Or have an admin grant you database admin role",
      );
    }

    if (adminErr) {
      debugInfo.recommendations.push(
        "Database admin function error - check database setup",
        "Ensure is_admin() function exists in database",
      );
    }

    if (userProfile && currentWallet !== userProfile.wallet_address) {
      debugInfo.recommendations.push(
        "Current wallet differs from profile wallet",
        "This might cause authentication issues",
        "Try refreshing or reconnecting wallet",
      );
    }

    return res.status(200).json(debugInfo);
  } catch (error: any) {
    log.error("Debug API error:", error);
    return res.status(500).json({
      debug: "Admin Debug Information",
      error: error.message,
      stack: error.stack,
      suggestions: [
        "Check server logs for more details",
        "Verify database connection",
        "Check environment variables",
      ],
    });
  }
}
