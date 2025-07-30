import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { unlockUtils } from "../../../../lib/unlock/lockUtils";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";

interface AdminReconcileRequest {
  applicationId: string;
}

/**
 * Admin endpoint to reconcile payment status for stuck transactions
 * POST /api/admin/payments/reconcile
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const { applicationId }: AdminReconcileRequest = req.body;

    if (!applicationId) {
      return res.status(400).json({
        error: "Missing applicationId",
      });
    }

    console.log(`Admin reconciling payment for application ${applicationId}`);

    // 1. Get application and related data to find lock address and wallet address
    const { data: appData, error: appError } = await supabase
      .from("applications")
      .select(
        `
        id,
        payment_status,
        user_email,
        cohorts (
          id,
          name,
          lock_address
        ),
        user_profiles (
          wallet_address
        )
      `
      )
      .eq("id", applicationId)
      .single();

    if (appError || !appData) {
      console.error(
        "Error fetching application for admin reconciliation:",
        appError
      );
      return res.status(404).json({ error: "Application not found" });
    }

    const lockAddress = appData.cohorts?.lock_address;
    const walletAddress = appData.user_profiles?.wallet_address;

    if (!lockAddress) {
      return res.status(400).json({
        error: "Lock address not found for cohort",
      });
    }

    if (!walletAddress) {
      return res.status(400).json({
        error:
          "Wallet address not found for user. User needs to connect a wallet first.",
      });
    }

    console.log(
      `Checking on-chain key ownership for wallet ${walletAddress} on lock ${lockAddress}`
    );

    // 2. Verify key ownership on-chain
    const hasKey = await unlockUtils.checkKeyOwnership(
      lockAddress,
      walletAddress
    );

    if (!hasKey) {
      console.log(`No valid key found for wallet ${walletAddress}`);
      return res.status(200).json({
        success: true,
        reconciled: false,
        message:
          "No valid key found on-chain for this user. Payment may have failed or user may not have completed the transaction.",
      });
    }

    console.log(
      `On-chain key ownership confirmed for wallet ${walletAddress} on lock ${lockAddress}`
    );

    // 3. Update database records
    // First, try to update existing payment transaction
    const { data: existingTx, error: txFetchError } = await supabase
      .from("payment_transactions")
      .select("id, payment_reference")
      .eq("application_id", applicationId)
      .single();

    if (txFetchError && txFetchError.code !== "PGRST116") {
      // PGRST116 is "not found", which is OK - we'll create a new record
      console.error("Error fetching payment transaction:", txFetchError);
    }

    if (existingTx) {
      // Update existing transaction
      const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
          status: "success",
          metadata: {
            reconciledAt: new Date().toISOString(),
            reconciledBy: "admin",
            originalStatus: "unknown",
          },
        })
        .eq("id", existingTx.id);

      if (updateError) {
        console.error("Failed to update payment transaction:", updateError);
        return res.status(500).json({
          error: "Failed to update payment transaction",
        });
      }
    } else {
      // Create new payment transaction record
      const { error: insertError } = await supabase
        .from("payment_transactions")
        .insert({
          application_id: applicationId,
          payment_reference: `admin-reconcile-${Date.now()}`,
          status: "success",
          payment_method: "blockchain",
          metadata: {
            reconciledAt: new Date().toISOString(),
            reconciledBy: "admin",
            note: "Created during admin reconciliation - original transaction record was missing",
          },
        });

      if (insertError) {
        console.error("Failed to create payment transaction:", insertError);
        return res.status(500).json({
          error: "Failed to create payment transaction record",
        });
      }
    }

    // 4. Update application status
    const { error: appUpdateError } = await supabase
      .from("applications")
      .update({
        payment_status: "completed",
        application_status: "submitted",
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      console.error("Failed to update application status:", appUpdateError);
      return res.status(500).json({
        error: "Failed to update application status",
      });
    }

    console.log(
      `Successfully reconciled application ${applicationId} via admin`
    );

    res.status(200).json({
      success: true,
      reconciled: true,
      message:
        "Payment successfully reconciled. User has valid key and application is now completed.",
    });
  } catch (error) {
    console.error("Admin reconciliation error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

// Wrap the handler with admin authentication middleware
export default withAdminAuth(handler);
