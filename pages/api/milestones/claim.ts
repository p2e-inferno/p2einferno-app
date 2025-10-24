import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { grantKeyToUser } from "@/lib/services/user-key-service";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:milestones:claim");

/**
 * API handler for a user to claim their milestone key.
 * This endpoint performs server-side validation and initiates a gasless key granting transaction.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res
        .status(401)
        .json({ error: "Unauthorized: User not authenticated." });
    }

    const { milestoneId } = req.body;
    if (!milestoneId) {
      return res
        .status(400)
        .json({ error: "Bad Request: milestoneId is required." });
    }

    const supabase = createAdminClient();

    // 1. Fetch user profile to get the internal user_profile_id
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("privy_user_id", user.id)
      .single();

    if (!profile) {
      return res.status(404).json({ error: "User profile not found." });
    }

    // 2. Verify the milestone is actually completed in the database for this user
    const { data: milestoneProgress } = await supabase
      .from("user_milestone_progress")
      .select(
        `
        status,
        milestone:milestone_id (
          lock_address
        )
      `,
      )
      .eq("milestone_id", milestoneId)
      .eq("user_profile_id", profile.id)
      .single();

    if (!milestoneProgress) {
      return res
        .status(404)
        .json({ error: "Milestone progress not found for this user." });
    }

    if (milestoneProgress.status !== "completed") {
      return res
        .status(403)
        .json({ error: "Forbidden: Milestone tasks are not completed yet." });
    }

    const lockAddress = (milestoneProgress.milestone as any)?.lock_address;
    if (!lockAddress) {
      return res
        .status(500)
        .json({ error: "Milestone is not configured with a lock address." });
    }

    // 3. Create wallet client and grant the key
    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      return res.status(500).json({
        error: "Server wallet not configured for key granting",
      });
    }

    const publicClient = createPublicClientUnified();
    log.info(
      `Attempting to grant key for lock ${lockAddress} to user ${user.id}`,
    );
    const grantResult = await grantKeyToUser(
      walletClient,
      publicClient,
      user.id,
      lockAddress,
    );

    if (!grantResult.success) {
      log.error(
        `Key grant failed for user ${user.id} on lock ${lockAddress}:`,
        grantResult.error,
      );
      const raw = grantResult.error || "";
      const errorMessage = raw.includes("LOCK_MANAGER_PRIVATE_KEY")
        ? "Server is not configured for on-chain grants yet. Please try again later."
        : raw.toLowerCase().includes("no wallet")
          ? "No wallet found. Please connect a wallet to claim your milestone key."
          : raw.toLowerCase().includes("already has a valid key")
            ? "You already have a key for this milestone."
            : "Failed to grant key on-chain. Please try again or contact support.";
      return res
        .status(500)
        .json({ error: errorMessage, details: grantResult.error });
    }

    log.info(
      `Successfully granted key for lock ${lockAddress} to user ${user.id}. Tx: ${grantResult.transactionHash}`,
    );

    // 4. Optionally, record the grant event in the database for tracking
    // await supabase.from('milestone_key_grants').insert({ milestone_id: milestoneId, user_profile_id: profile.id, transaction_hash: grantResult.transactionHash });

    res
      .status(200)
      .json({ success: true, transactionHash: grantResult.transactionHash });
  } catch (error: any) {
    log.error("Error in /api/milestones/claim:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
}
