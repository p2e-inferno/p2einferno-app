import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { unlockUtils } from "../../../../lib/unlock/lockUtils";

const supabase = createAdminClient();

interface ReconcileRequest {
  applicationId: string;
  walletAddress?: string; // Now optional for admin calls
  admin?: boolean; // Flag to indicate admin call
}

/**
 * Reconcile payment status for a user who already has a key
 * but whose database record is out of sync.
 * POST /api/payment/blockchain/reconcile
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      applicationId,
      walletAddress,
      admin = false,
    }: ReconcileRequest = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: "Missing applicationId" });
    }

    // If admin call, we need to fetch the wallet address from user profile
    let userWalletAddress = walletAddress;

    if (admin && !walletAddress) {
      // TODO: Add proper admin authentication check here

      const { data: userProfileData, error: profileError } = await supabase
        .from("applications")
        .select(
          `
          user_profiles (
            wallet_address
          )
        `
        )
        .eq("id", applicationId)
        .single();

      const userProfile = Array.isArray(userProfileData?.user_profiles) ? userProfileData.user_profiles[0] : userProfileData?.user_profiles;
      
      if (profileError || !userProfile?.wallet_address) {
        return res.status(400).json({
          error:
            "Could not fetch wallet address for user. User may need to connect a wallet first.",
        });
      }

      userWalletAddress = userProfile.wallet_address;
    }

    if (!userWalletAddress) {
      return res.status(400).json({
        error: admin
          ? "Wallet address not found for user"
          : "Missing walletAddress parameter",
      });
    }

    console.log(
      `Reconciling payment for application ${applicationId} and wallet ${userWalletAddress}${
        admin ? " (admin call)" : ""
      }`
    );

    // 1. Get application and cohort details to find the lock address
    const { data: appData, error: appError } = await supabase
      .from("applications")
      .select(
        `
        id,
        payment_status,
        cohorts (
          id,
          lock_address
        )
      `
      )
      .eq("id", applicationId)
      .single();

    if (appError || !appData) {
      console.error("Error fetching application for reconciliation:", appError);
      return res.status(404).json({ error: "Application not found" });
    }

    const cohort = Array.isArray(appData.cohorts) ? appData.cohorts[0] : appData.cohorts;
    const lockAddress = cohort?.lock_address;
    if (!lockAddress) {
      return res
        .status(400)
        .json({ error: "Lock address not found for cohort" });
    }

    // 2. Verify key ownership on-chain
    const hasKey = await unlockUtils.checkKeyOwnership(
      lockAddress,
      userWalletAddress
    );

    if (!hasKey) {
      return res
        .status(400)
        .json({ error: "No valid key found on-chain for this user." });
    }

    console.log(
      `On-chain key ownership confirmed for wallet ${userWalletAddress} on lock ${lockAddress}`
    );

    // 3. Update database records
    // Update payment transaction (if one exists)
    await supabase
      .from("payment_transactions")
      .update({
        status: "success",
        metadata: {
          reconciledAt: new Date().toISOString(),
          reconciled: true,
          reconciledBy: admin ? "admin" : "user",
        },
      })
      .eq("application_id", applicationId);

    // Update application status
    const { error: appUpdateError } = await supabase
      .from("applications")
      .update({
        payment_status: "completed",
        application_status: "submitted",
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      throw appUpdateError;
    }

    console.log(`Successfully reconciled application ${applicationId}`);

    res
      .status(200)
      .json({ success: true, message: "Reconciliation successful" });
  } catch (error) {
    console.error("Reconciliation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
