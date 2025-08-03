import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Auth
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const supabase = createAdminClient();

    // Verify admin role via user_profiles metadata.role === 'admin'
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, wallet_address, metadata, linked_wallets")
      .eq("privy_user_id", user.id)
      .single();

    if (!profile) {
      return res.status(403).json({ error: "User profile not found" });
    }

    // Get current wallet addresses from Privy API
    const userWalletAddresses = await getUserWalletAddresses(user.id);
    const currentWalletAddress =
      userWalletAddresses.length > 0 ? userWalletAddresses[0] : null;

    // Update profile with current wallet addresses if different
    const needsWalletUpdate =
      currentWalletAddress && currentWalletAddress !== profile.wallet_address;
    const needsLinkedWalletsUpdate =
      JSON.stringify(userWalletAddresses.sort()) !==
      JSON.stringify((profile.linked_wallets || []).sort());

    if (needsWalletUpdate || needsLinkedWalletsUpdate) {
      console.log("Updating user profile wallet information:", {
        oldWalletAddress: profile.wallet_address,
        newWalletAddress: currentWalletAddress,
        oldLinkedWallets: profile.linked_wallets,
        newLinkedWallets: userWalletAddresses,
      });

      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          wallet_address: currentWalletAddress,
          linked_wallets: userWalletAddresses,
        })
        .eq("id", profile.id);

      if (updateError) {
        console.error("Error updating wallet information:", updateError);
      } else {
        profile.wallet_address = currentWalletAddress;
        profile.linked_wallets = userWalletAddresses;
      }
    }

    // Check admin status
    let isAdmin = profile.metadata?.role === "admin";

    // If not admin via DB, check DEV_ADMIN_ADDRESSES
    if (!isAdmin && process.env.DEV_ADMIN_ADDRESSES) {
      const devAdmins = process.env.DEV_ADMIN_ADDRESSES.split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      // Use all wallet addresses from Privy (most up-to-date source) + database fallback
      const allUserWallets = [
        ...userWalletAddresses.map((w) => w.toLowerCase()),
        profile.wallet_address?.toLowerCase(),
        ...(profile.linked_wallets || []).map((w: any) => w.toLowerCase()),
      ].filter(Boolean);

      // Remove duplicates
      const uniqueUserWallets = [...new Set(allUserWallets)];

      if (uniqueUserWallets.some((wallet) => devAdmins.includes(wallet))) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Admins only" });
    }

    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Bootcamp ID is required" });
    }

    switch (req.method) {
      case "DELETE":
        return await deleteBootcamp(res, supabase, id);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("Bootcamp API error:", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}

async function deleteBootcamp(
  res: NextApiResponse,
  supabase: any,
  bootcampId: string
) {
  try {
    const { error } = await supabase
      .from("bootcamp_programs")
      .delete()
      .eq("id", bootcampId);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Delete bootcamp error:", error);
    return res.status(400).json({ error: error.message || "Failed to delete" });
  }
}
