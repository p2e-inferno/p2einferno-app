import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { getReadOnlyProvider } from "../../../../lib/unlock/lockUtils";
import { CHAIN_CONFIG } from "../../../../lib/blockchain/config";
import { enrollmentService } from "../../../../lib/services/enrollment-service";
import { StatusSyncService } from "../../../../lib/services/status-sync-service";

const supabase = createAdminClient();

interface BlockchainVerifyRequest {
  transactionHash?: string;
  applicationId: string;
  paymentReference: string;
  failed?: boolean;
  errorMessage?: string;
}

/**
 * Verify blockchain payment transaction and update database
 * POST /api/payment/blockchain/verify
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
      transactionHash,
      applicationId,
      paymentReference,
      failed = false,
      errorMessage,
    }: BlockchainVerifyRequest = req.body;

    // Validate required fields
    if (!applicationId || !paymentReference) {
      return res.status(400).json({
        error: "Missing required fields: applicationId, paymentReference",
      });
    }

    // Handle failed payment case (user rejected or tx failure pre-chain)
    if (failed || !transactionHash) {
      console.log(
        `Recording failed payment for reference: ${paymentReference}`
      );

      const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          metadata: {
            error: errorMessage || "Transaction failed",
            failedAt: new Date().toISOString(),
          },
        })
        .eq("payment_reference", paymentReference);

      if (updateError) {
        console.error("Failed to update payment transaction:", updateError);
        return res
          .status(500)
          .json({ error: "Failed to update payment record" });
      }

      return res
        .status(200)
        .json({ success: false, error: errorMessage || "Payment failed" });
    }

    console.log(`Verifying blockchain transaction: ${transactionHash}`);

    // ─────────────────────────────────────────────────────────────
    // 1.  Get the on-chain receipt & basic sanity checks
    // ─────────────────────────────────────────────────────────────
    const provider = getReadOnlyProvider();

    let receipt;
    try {
      receipt = await provider.getTransactionReceipt(transactionHash);
    } catch (error) {
      console.error("Failed to get transaction receipt:", error);
      return res
        .status(400)
        .json({ error: "Transaction not found on blockchain" });
    }

    if (!receipt) {
      return res.status(400).json({ error: "Transaction not found" });
    }

    if (receipt.status !== 1) {
      console.log(`Transaction failed on blockchain: ${transactionHash}`);

      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          transaction_hash: transactionHash,
          network_chain_id: CHAIN_CONFIG.chain.id,
          metadata: {
            error: "Transaction failed on blockchain",
            failedAt: new Date().toISOString(),
          },
        })
        .eq("payment_reference", paymentReference);

      return res
        .status(400)
        .json({ error: "Transaction failed on blockchain" });
    }

    // Extract keyTokenId (if any) from Transfer logs
    let keyTokenId: string | null = null;
    if (receipt.logs) {
      const transferEventTopic =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      for (const log of receipt.logs) {
        if (log.topics[0] === transferEventTopic && log.topics.length >= 4) {
          try {
            keyTokenId = BigInt(log.topics[3]!).toString();
            break;
          } catch (_) {
            /* ignore parse errors */
          }
        }
      }
    }

    // Extra network sanity
    const transaction = await provider.getTransaction(transactionHash);
    if (!transaction) {
      return res
        .status(400)
        .json({ error: "Could not verify transaction details" });
    }

    // ─────────────────────────────────────────────────────────────
    // 2.  Write / update payment_transactions with fallbacks
    // ─────────────────────────────────────────────────────────────
    const successUpdateFields = {
      status: "success",
      transaction_hash: transactionHash,
      key_token_id: keyTokenId,
      network_chain_id: CHAIN_CONFIG.chain.id,
      metadata: {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: String((receipt as any).effectiveGasPrice ?? ""),
        verifiedAt: new Date().toISOString(),
      },
    } as const;

    // ❶ Primary update by payment_reference
    let { data: txRows, error: updateError } = await supabase
      .from("payment_transactions")
      .update(successUpdateFields)
      .eq("payment_reference", paymentReference)
      .select("application_id");

    let transactionRow = Array.isArray(txRows) ? txRows[0] : txRows;

    // ❷ Fallback update by application_id (reference mismatch)
    if (updateError || !transactionRow) {
      const { data: appTxRows, error: appErr } = await supabase
        .from("payment_transactions")
        .update({
          ...successUpdateFields,
          metadata: {
            ...successUpdateFields.metadata,
            reconciledVia: "fallback-application-id",
          },
        })
        .eq("application_id", applicationId)
        .select("application_id");

      transactionRow = Array.isArray(appTxRows) ? appTxRows[0] : appTxRows;
      updateError = appErr;
    }

    // ❸ Still nothing?  → mark as processing so reconcile can fix later
    if (updateError || !transactionRow) {
      console.error(
        "Primary & fallback update failed – inserting processing row:",
        updateError
      );

      await supabase.from("payment_transactions").upsert({
        application_id: applicationId,
        payment_reference: paymentReference,
        status: "processing",
        transaction_hash: transactionHash,
        network_chain_id: CHAIN_CONFIG.chain.id,
        metadata: {
          fallback: true,
          originalError: updateError?.message ?? "No matching row",
          createdAt: new Date().toISOString(),
        },
      });

      await supabase
        .from("applications")
        .update({ payment_status: "processing" })
        .eq("id", applicationId);

      return res.status(202).json({ success: true, processing: true });
    }

    // ─────────────────────────────────────────────────────────────
    // 3.  Get user profile for status synchronization
    // ─────────────────────────────────────────────────────────────
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select(`
        id,
        user_email,
        user_profiles!applications_user_email_fkey (
          id
        )
      `)
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      console.error("Failed to get application:", appError);
      return res.status(500).json({ error: "Failed to get application details" });
    }

    const userProfileId = application.user_profiles?.id;
    if (!userProfileId) {
      console.error("No user profile found for application:", applicationId);
      return res.status(500).json({ error: "User profile not found" });
    }

    // ─────────────────────────────────────────────────────────────
    // 4.  Use status sync service for comprehensive status update
    // ─────────────────────────────────────────────────────────────
    console.log(`Syncing status for application ${applicationId}`);
    const statusSyncResult = await StatusSyncService.syncApplicationStatus({
      applicationId,
      userProfileId,
      paymentStatus: 'completed',
      applicationStatus: 'approved', // Auto-approve on successful payment
      reason: 'Blockchain payment verified'
    });

    if (!statusSyncResult.success) {
      console.error("Failed to sync application status:", statusSyncResult.error);
      // Fallback to old method if status sync fails
      await supabase
        .from("applications")
        .update({ payment_status: "completed", application_status: "approved" })
        .eq("id", applicationId);
    }

    // ─────────────────────────────────────────────────────────────
    // 5.  Create enrollment for the completed application
    // ─────────────────────────────────────────────────────────────
    console.log(`Creating enrollment for application ${applicationId}`);
    const enrollmentResult = await enrollmentService.createEnrollmentForCompletedApplication(applicationId);
    
    if (!enrollmentResult.success) {
      console.error("Failed to create enrollment:", enrollmentResult.error);
      // Don't fail the entire verification, just log the error
      // The user can still use the reconcile endpoint to fix this later
    } else {
      console.log("Enrollment created successfully:", enrollmentResult.message);
      
      // Update status to enrolled if enrollment was successful
      await StatusSyncService.syncApplicationStatus({
        applicationId,
        userProfileId,
        enrollmentStatus: 'active',
        reason: 'Enrollment created after payment verification'
      });
    }

    console.log(`Payment verification successful for ${paymentReference}`);

    return res.status(200).json({
      success: true,
      data: {
        transactionHash,
        keyTokenId,
        networkChainId: CHAIN_CONFIG.chain.id,
        blockNumber: receipt.blockNumber,
        status: "success",
      },
    });
  } catch (error) {
    console.error("Blockchain payment verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
