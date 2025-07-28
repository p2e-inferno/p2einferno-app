import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser, getUserWalletAddresses } from "@/lib/auth/privy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Authenticate via Privy
    const user = await getPrivyUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = createAdminClient();

    // Check admin privileges
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("id, wallet_address, metadata, linked_wallets")
      .eq("privy_user_id", user.id)
      .single();

    if (!userProfile) {
      return res
        .status(403)
        .json({ error: "Forbidden: User profile not found" });
    }

    // Get current wallet addresses from Privy API
    const userWalletAddresses = await getUserWalletAddresses(user.id);
    const currentWalletAddress =
      userWalletAddresses.length > 0 ? userWalletAddresses[0] : null;

    // Update profile with current wallet addresses if different
    const needsWalletUpdate =
      currentWalletAddress &&
      currentWalletAddress !== userProfile.wallet_address;
    const needsLinkedWalletsUpdate =
      JSON.stringify(userWalletAddresses.sort()) !==
      JSON.stringify((userProfile.linked_wallets || []).sort());

    if (needsWalletUpdate || needsLinkedWalletsUpdate) {
      console.log("Updating user profile wallet information:", {
        oldWalletAddress: userProfile.wallet_address,
        newWalletAddress: currentWalletAddress,
        oldLinkedWallets: userProfile.linked_wallets,
        newLinkedWallets: userWalletAddresses,
      });

      const { error: updateError } = await supabase
        .from("user_profiles")
        .update({
          wallet_address: currentWalletAddress,
          linked_wallets: userWalletAddresses,
        })
        .eq("id", userProfile.id);

      if (updateError) {
        console.error("Error updating wallet information:", updateError);
      } else {
        userProfile.wallet_address = currentWalletAddress;
        userProfile.linked_wallets = userWalletAddresses;
      }
    }

    console.log("Admin check for user:", {
      userId: user.id,
      profileId: userProfile.id,
      walletAddress: userProfile.wallet_address,
      currentWallet: currentWalletAddress,
      metadata: userProfile.metadata,
      linkedWallets: userProfile.linked_wallets,
      privyWallets: userWalletAddresses,
    });

    // Determine admin status: DB function or DEV allow-list
    let isAdmin = false;
    const { data: adminDbCheck, error: adminErr } = await supabase.rpc(
      "is_admin",
      { user_id: userProfile.id }
    );
    if (adminErr) {
      console.error("Admin DB check error:", adminErr);
      throw adminErr;
    }
    if (adminDbCheck) {
      isAdmin = true;
      console.log("Admin access granted via database role");
    }

    // Check DEV_ADMIN_ADDRESSES if not admin via DB
    if (!isAdmin && process.env.DEV_ADMIN_ADDRESSES) {
      const devAdmins = process.env.DEV_ADMIN_ADDRESSES.split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      // Use all wallet addresses from Privy (most up-to-date source) + database fallback
      const allUserWallets = [
        ...userWalletAddresses.map((w) => w.toLowerCase()),
        userProfile.wallet_address?.toLowerCase(),
        ...(userProfile.linked_wallets || []).map((w) => w.toLowerCase()),
      ].filter(Boolean);

      // Remove duplicates
      const uniqueUserWallets = [...new Set(allUserWallets)];

      console.log("Checking DEV_ADMIN_ADDRESSES:", {
        devAdmins,
        userWallets: uniqueUserWallets,
        privyWallets: userWalletAddresses,
        isMatch: uniqueUserWallets.some((wallet) => devAdmins.includes(wallet)),
      });

      if (uniqueUserWallets.some((wallet) => devAdmins.includes(wallet))) {
        isAdmin = true;
        console.log("Admin access granted via DEV_ADMIN_ADDRESSES");
      }
    }

    if (!isAdmin) {
      console.log("Admin access denied for user:", user.id);
      return res.status(403).json({
        error: "Forbidden: Admins only",
        details: {
          userId: user.id,
          walletAddress: userProfile.wallet_address,
          linkedWallets: userProfile.linked_wallets,
          hasDbRole: adminDbCheck,
          devAdmins: process.env.DEV_ADMIN_ADDRESSES,
        },
      });
    }

    console.log("Admin access granted for user:", user.id);

    switch (req.method) {
      case "POST":
        return await createCohort(req, res, supabase);
      case "PUT":
        return await updateCohort(req, res, supabase);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

async function createCohort(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const cohort = req.body;
  if (!cohort || !cohort.id || !cohort.name || !cohort.bootcamp_program_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const now = new Date().toISOString();
    if (!cohort.created_at) cohort.created_at = now;
    if (!cohort.updated_at) cohort.updated_at = now;
    const { data, error } = await supabase
      .from("cohorts")
      .insert(cohort)
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error: any) {
    console.error("Error creating cohort:", error);
    return res.status(400).json({ error: error.message });
  }
}

async function updateCohort(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { id, ...cohort } = req.body;
  if (!id) return res.status(400).json({ error: "Missing cohort ID" });
  try {
    cohort.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("cohorts")
      .update(cohort)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error: any) {
    console.error("Error updating cohort:", error);
    return res.status(400).json({ error: error.message });
  }
}
