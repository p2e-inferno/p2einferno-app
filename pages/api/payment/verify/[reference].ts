// Path: p2einferno-app/pages/api/payment/verify/[reference].ts
import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import axios from "axios";
import { extractAndValidateApplicationId } from "../../../../lib/helpers/payment-helpers";
import { grantKeyService } from "../../../../lib/blockchain/services/grant-key-service";
import { isServerBlockchainConfigured } from "../../../../lib/blockchain/legacy/server-config";
import { isValidEthereumAddress } from "../../../../lib/blockchain/services/transaction-service";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:payment:verify:[reference]");

const supabase = createAdminClient();

// Paystack API verification
async function verifyPaystackTransaction(reference: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Paystack secret key not configured");
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        timeout: 20000, // 20 second timeout
      },
    );

    return response.data;
  } catch (error) {
    log.error("Paystack verification error:", error);
    throw error;
  }
}

// Manual payment processing if webhook failed
async function processPaymentManually(paystackData: any) {
  // Extract applicationId using robust extraction logic
  const extractionResult = extractAndValidateApplicationId(paystackData.data);

  if (!extractionResult.success || !extractionResult.applicationId) {
    log.error("Manual processing: Failed to extract applicationId", {
      method: extractionResult.method,
      availableMetadata: paystackData.data?.metadata
        ? Object.keys(paystackData.data.metadata)
        : "none",
    });
    throw new Error(
      "No applicationId found in referrer URL or Paystack metadata",
    );
  }

  const applicationId = extractionResult.applicationId;
  log.info(
    `Manual processing: Extracted applicationId via ${extractionResult.method}:`,
    applicationId,
  );

  log.info("Manual payment processing for application:", applicationId);

  // Call our database function to process the payment
  const { data, error } = await supabase.rpc("handle_successful_payment", {
    p_application_id: applicationId,
    p_payment_reference: paystackData.data.reference,
    p_payment_method: "paystack",
    p_transaction_details: paystackData.data,
  });

  if (error || !data?.[0]?.success) {
    log.error("Manual payment processing failed:", error || data?.[0]?.message);
    throw new Error(data?.[0]?.message || "Payment processing failed");
  }

  log.info("Manual payment processing successful:", data[0]);

  // Update payment transaction with Paystack reference
  try {
    await supabase
      .from("payment_transactions")
      .update({
        paystack_reference: paystackData.data.reference,
        status: "success",
      })
      .eq("application_id", applicationId);

    log.info(
      "Manual processing: Updated transaction with Paystack reference:",
      paystackData.data.reference,
    );
  } catch (updateError) {
    log.error(
      "Manual processing: Failed to update Paystack reference:",
      updateError,
    );
    // Don't fail the entire process if this update fails
  }

  return data[0];
}

// Grant key to user after successful payment
async function grantKeyToUser(applicationId: string, maxRetries: number = 2) {
  if (!isServerBlockchainConfigured()) {
    log.warn("Key granting skipped - server blockchain not configured");
    return { success: false, error: "Blockchain not configured" };
  }

  try {
    // Get user profile and cohort info
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select(
        `
        user_profile_id,
        cohort_id,
        cohorts!inner(
          name,
          lock_address
        )
      `,
      )
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      log.error("Error fetching application for key granting:", appError);
      return { success: false, error: "Application not found" };
    }

    // Get user wallet address
    const { data: userProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("wallet_address, privy_user_id")
      .eq("id", application.user_profile_id)
      .single();

    if (profileError || !userProfile) {
      log.error("Error fetching user profile for key granting:", profileError);
      return { success: false, error: "User profile not found" };
    }

    const cohort = Array.isArray(application.cohorts)
      ? application.cohorts[0]
      : application.cohorts;
    if (!cohort?.lock_address) {
      log.warn(
        `Cohort ${cohort?.name} has no lock address - skipping key granting`,
      );
      return { success: false, error: "Cohort has no lock address" };
    }

    if (!userProfile.wallet_address) {
      log.warn(
        `User ${userProfile.privy_user_id} has no wallet address - skipping key granting`,
      );
      return { success: false, error: "User has no wallet address" };
    }

    if (!isValidEthereumAddress(userProfile.wallet_address)) {
      log.error(
        `Invalid wallet address for user ${userProfile.privy_user_id}: ${userProfile.wallet_address}`,
      );
      return { success: false, error: "Invalid user wallet address" };
    }

    log.info(
      `Granting key to user ${userProfile.wallet_address} for cohort ${cohort.name} (${cohort.lock_address})`,
    );

    // Check if user already has a valid key
    const hasValidKey = await grantKeyService.userHasValidKey(
      userProfile.wallet_address,
      cohort.lock_address as `0x${string}`,
    );

    if (hasValidKey) {
      log.info(
        `User ${userProfile.wallet_address} already has a valid key for cohort ${cohort.name}`,
      );
      return { success: true, message: "User already has valid key" };
    }

    // Grant key with retry logic
    let lastError: string = "";
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        log.info(`Key granting attempt ${attempt}/${maxRetries}`);

        const grantResult = await grantKeyService.grantKeyToUser({
          walletAddress: userProfile.wallet_address,
          lockAddress: cohort.lock_address as `0x${string}`,
          keyManagers: [],
        });

        if (grantResult.success) {
          log.info(
            `Key granted successfully on attempt ${attempt}:`,
            grantResult,
          );

          // Log successful key granting
          await supabase.from("user_activities").insert({
            user_profile_id: application.user_profile_id,
            activity_type: "key_granted",
            activity_data: {
              cohortId: application.cohort_id,
              lockAddress: cohort.lock_address,
              transactionHash: grantResult.transactionHash,
              attempt: attempt,
            },
            points_earned: 0,
          });

          return {
            success: true,
            message: "Key granted successfully",
            transactionHash: grantResult.transactionHash,
          };
        } else {
          lastError = grantResult.error || "Unknown error";
          log.error(`Key granting attempt ${attempt} failed:`, lastError);

          if (attempt < maxRetries) {
            const delay = attempt * 2000; // Exponential backoff: 2s, 4s
            log.info(`Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      } catch (error: any) {
        lastError = error.message || "Unexpected error";
        log.error(`Key granting attempt ${attempt} threw error:`, error);

        if (attempt < maxRetries) {
          const delay = attempt * 2000;
          log.info(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - log for reconciliation
    log.error(
      `Key granting failed after ${maxRetries} attempts. Logging for reconciliation.`,
    );

    await supabase.from("user_activities").insert({
      user_profile_id: application.user_profile_id,
      activity_type: "key_grant_failed",
      activity_data: {
        cohortId: application.cohort_id,
        lockAddress: cohort.lock_address,
        error: lastError,
        attempts: maxRetries,
        requiresReconciliation: true,
      },
      points_earned: 0,
    });

    return {
      success: false,
      error: `Key granting failed after ${maxRetries} attempts: ${lastError}`,
    };
  } catch (error: any) {
    log.error("Key granting setup error:", error);
    return {
      success: false,
      error: error.message || "Setup error for key granting",
    };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { reference } = req.query;

    if (!reference || typeof reference !== "string") {
      return res.status(400).json({ error: "Invalid payment reference" });
    }

    log.info(`Payment verification for reference: ${reference}`);

    // Step 1: Try to get applicationId from referrer header to query database
    let applicationId: string | null = null;
    const referrer = req.headers.referer || req.headers.referrer;

    if (referrer) {
      const referrerString = Array.isArray(referrer) ? referrer[0] : referrer;
      if (referrerString) {
        const referrerMatch = referrerString.match(
          /\/payment\/([a-fA-F0-9-]+)/,
        );
        if (referrerMatch && referrerMatch[1]) {
          applicationId = referrerMatch[1];
          log.info("Found applicationId from referrer header:", applicationId);
        }
      }
    }

    // Step 2: Check webhook-updated status in our database using applicationId if available
    let transaction: any = null;
    let dbError: any = null;

    if (applicationId) {
      // Query by applicationId
      const result = await supabase
        .from("payment_transactions")
        .select("status, application_id, created_at, paystack_reference")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      transaction = result.data;
      dbError = result.error;

      log.info("Transaction lookup by applicationId:", {
        found: !dbError && !!transaction,
        status: transaction?.status,
        applicationId: transaction?.application_id,
        paystackReference: transaction?.paystack_reference,
        createdAt: transaction?.created_at,
        dbError: dbError?.message,
      });
    } else {
      // Fallback: Query by payment_reference
      log.info(
        "No applicationId found in referrer, falling back to reference lookup",
      );
      const result = await supabase
        .from("payment_transactions")
        .select("status, application_id, created_at, paystack_reference")
        .eq("payment_reference", reference)
        .single();

      transaction = result.data;
      dbError = result.error;

      log.info("Transaction lookup by reference (fallback):", {
        found: !dbError && !!transaction,
        status: transaction?.status,
        applicationId: transaction?.application_id,
        paystackReference: transaction?.paystack_reference,
        createdAt: transaction?.created_at,
        dbError: dbError?.message,
        reference: reference,
      });
    }

    // If webhook processed successfully, return immediately
    if (!dbError && transaction && transaction.status === "success") {
      log.info("✓ Webhook-processed payment found with success status");

      // Grant key to user for webhook-processed payments
      log.info(
        "Webhook-processed payment successful, attempting to grant key to user...",
      );
      const keyGrantResult = await grantKeyToUser(transaction.application_id);

      if (keyGrantResult.success) {
        log.info(
          "Key granting successful for webhook payment:",
          keyGrantResult.message,
        );
      } else {
        log.warn(
          "Key granting failed for webhook payment:",
          keyGrantResult.error,
        );
        // Note: We don't fail the payment response if key granting fails
      }

      return res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        source: "webhook",
        data: {
          status: transaction.status,
          applicationId: transaction.application_id,
          keyGranted: keyGrantResult.success,
          keyGrantMessage: keyGrantResult.message,
        },
      });
    }

    // If webhook shows failed, return immediately
    if (!dbError && transaction && transaction.status === "failed") {
      log.info("✗ Webhook-processed payment found with failed status");
      return res.status(200).json({
        success: false,
        message: "Payment failed",
        source: "webhook",
        data: {
          status: transaction.status,
          applicationId: transaction.application_id,
        },
      });
    }

    // Step 2: Check if we should wait for webhook
    if (!dbError && transaction && transaction.status === "pending") {
      const now = Date.now();
      const createdTime = new Date(transaction.created_at).getTime();
      const pendingTime = now - createdTime;
      const maxWebhookWaitTime = 30000; // 30 seconds for webhook

      log.info("Webhook wait analysis:", {
        now: new Date(now).toISOString(),
        createdAt: new Date(createdTime).toISOString(),
        pendingTimeMs: pendingTime,
        pendingTimeSeconds: Math.floor(pendingTime / 1000),
        maxWaitTimeMs: maxWebhookWaitTime,
        shouldWait: pendingTime < maxWebhookWaitTime,
      });

      if (pendingTime < maxWebhookWaitTime) {
        const remainingWaitTime = Math.ceil(
          (maxWebhookWaitTime - pendingTime) / 1000,
        );
        log.info(`⏳ Webhook wait: ${remainingWaitTime}s remaining`);

        return res.status(200).json({
          success: false,
          status: "pending",
          message: "Payment is being processed. Please wait...",
          source: "webhook_pending",
          retryAfter: remainingWaitTime,
        });
      } else {
        log.info("⏰ Webhook wait timeout exceeded, proceeding to fallback");
      }
    } else if (dbError) {
      log.info(
        "⚠️ Transaction not found in database, proceeding to fallback:",
        dbError.message,
      );
    } else if (!transaction) {
      log.info("⚠️ No transaction record found, proceeding to fallback");
    } else {
      log.info(
        `⚠️ Transaction status is '${transaction.status}', proceeding to fallback`,
      );
    }

    // Step 3: Webhook hasn't processed or timeout - fall back to direct Paystack verification
    log.info(
      "Webhook not processed or timeout, falling back to Paystack API verification",
    );

    let paystackData;
    try {
      paystackData = await verifyPaystackTransaction(reference);
    } catch (error) {
      log.error("Paystack verification failed:", error);

      // If we have a pending transaction in DB, check how long it's been pending
      if (!dbError && transaction && transaction.status === "pending") {
        const pendingTime =
          Date.now() - new Date(transaction.created_at).getTime();
        const maxPendingTime = 15000; // 15 seconds max for pending

        if (pendingTime < maxPendingTime) {
          return res.status(200).json({
            success: false,
            status: "pending",
            message: "Payment is being processed. Please wait...",
            source: "database",
            retryAfter: Math.ceil((maxPendingTime - pendingTime) / 1000), // seconds until timeout
          });
        } else {
          // Pending too long, treat as not found and try Paystack fallback
          log.info(
            "Transaction pending too long, falling back to Paystack API",
          );
        }
      }

      // Otherwise, assume invalid reference
      return res.status(200).json({
        success: false,
        status: "not_found",
        message: "Payment reference not found",
        source: "paystack_fallback",
      });
    }

    // Step 3: Process Paystack response
    if (!paystackData.status || !paystackData.data) {
      return res.status(200).json({
        success: false,
        status: "invalid",
        message: "Invalid payment reference",
        source: "paystack_fallback",
      });
    }

    // Sanitize logging: avoid logging full Paystack payload/PII
    log.info("Paystack verify (sanitized)", {
      status: paystackData?.data?.status,
      amount: paystackData?.data?.amount,
      hasMetadata: Boolean(paystackData?.data?.metadata),
      hasReferrer: Boolean(paystackData?.data?.metadata?.referrer),
      hasCustomer: Boolean(paystackData?.data?.customer),
    });

    const paystackStatus = paystackData.data.status;
    const paystackAmount = paystackData.data.amount;

    // Step 4: Handle different Paystack statuses
    switch (paystackStatus) {
      case "success":
        log.info(
          "Paystack shows success, but webhook missed - processing manually",
        );
        try {
          const processResult = await processPaymentManually(paystackData);

          // Grant key to user after successful payment processing
          log.info(
            "Payment processing successful, attempting to grant key to user...",
          );
          const keyGrantResult = await grantKeyToUser(
            processResult.returned_application_id,
          );

          if (keyGrantResult.success) {
            log.info("Key granting successful:", keyGrantResult.message);
          } else {
            log.warn(
              "Key granting failed but payment processed:",
              keyGrantResult.error,
            );
            // Note: We don't fail the payment response if key granting fails
            // The reconciliation system will handle retry later
          }

          return res.status(200).json({
            success: true,
            message: "Payment verified and processed successfully",
            source: "paystack_fallback_processed",
            data: {
              status: "success",
              applicationId: processResult.returned_application_id,
              enrollmentId: processResult.enrollment_id,
              amount: paystackAmount / 100, // Convert from kobo
              keyGranted: keyGrantResult.success,
              keyGrantMessage: keyGrantResult.message,
            },
          });
        } catch (error) {
          log.error("Manual processing failed:", error);
          return res.status(200).json({
            success: false,
            status: "processing_error",
            message:
              "Payment successful but processing failed. Please contact support.",
            source: "paystack_fallback_error",
            data: {
              paystackStatus: "success",
              amount: paystackAmount / 100,
            },
          });
        }

      case "failed":
      case "cancelled":
      case "abandoned":
        return res.status(200).json({
          success: false,
          status: paystackStatus,
          message: `Payment ${paystackStatus}`,
          source: "paystack_fallback",
          data: {
            status: paystackStatus,
            amount: paystackAmount / 100,
          },
        });

      case "pending":
      case "ongoing":
        return res.status(200).json({
          success: false,
          status: "pending",
          message: "Payment is still being processed",
          source: "paystack_fallback",
          data: {
            status: paystackStatus,
            amount: paystackAmount / 100,
          },
        });

      default:
        return res.status(200).json({
          success: false,
          status: "unknown",
          message: `Payment status: ${paystackStatus}`,
          source: "paystack_fallback",
          data: {
            status: paystackStatus,
            amount: paystackAmount / 100,
          },
        });
    }
  } catch (error) {
    log.error("Payment verification error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Unable to verify payment status",
    });
  }
}
