import { NextApiRequest, NextApiResponse } from "next";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { buffer } from "micro";
import { extractAndValidateApplicationId } from "../../../lib/payment-helpers";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:payment:webhook");

// Disable default body parsing to access the raw body for signature verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

const handleSuccessfulCharge = async (supabase: any, paymentData: any) => {
  const paymentReference = paymentData.reference;

  // Extract applicationId using robust extraction logic
  const extractionResult = extractAndValidateApplicationId(paymentData);

  if (!extractionResult.success || !extractionResult.applicationId) {
    log.error("Webhook: Failed to extract applicationId", {
      method: extractionResult.method,
      reference: paymentReference,
      availableMetadata: paymentData.metadata
        ? Object.keys(paymentData.metadata)
        : "none",
    });
    return;
  }

  const applicationId = extractionResult.applicationId;
  log.info(
    `Webhook: Extracted applicationId via ${extractionResult.method}:`,
    applicationId,
  );

  try {
    // First, check if payment transaction exists for this application
    const { data: existingTransaction, error: queryError } = await supabase
      .from("payment_transactions")
      .select("id, status")
      .eq("application_id", applicationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (queryError || !existingTransaction) {
      log.error(
        "Webhook: No pending transaction found for applicationId:",
        applicationId,
        queryError?.message,
      );
      return;
    }

    log.info("Webhook: Found pending transaction:", existingTransaction.id);

    const { data, error } = await supabase.rpc("handle_successful_payment", {
      p_application_id: applicationId,
      p_payment_reference: paymentReference,
      p_payment_method: "paystack",
      p_transaction_details: paymentData,
    });

    if (error) {
      log.error("Payment processing error:", error);
    } else if (!data || !data[0] || !data[0].success) {
      log.error(
        "Payment processing failed:",
        data?.[0]?.message || "Unknown error",
      );
    } else {
      log.info("Payment processed successfully:", data[0].message);

      // Update payment transaction with Paystack reference and success status
      await supabase
        .from("payment_transactions")
        .update({
          paystack_reference: paymentReference,
          status: "success",
        })
        .eq("id", existingTransaction.id);

      log.info(
        "Webhook: Updated transaction with Paystack reference:",
        paymentReference,
      );
    }
  } catch (e) {
    log.error("Payment processing exception:", e);
  }
};

const handleFailedCharge = async (supabase: any, paymentData: any) => {
  const reference = paymentData.reference;

  // Extract applicationId using robust extraction logic
  const extractionResult = extractAndValidateApplicationId(paymentData);

  if (
    !extractionResult.success ||
    !extractionResult.applicationId ||
    !reference
  ) {
    log.error("Webhook: Failed charge missing required data", {
      method: extractionResult.method,
      hasApplicationId: !!extractionResult.applicationId,
      hasReference: !!reference,
      availableMetadata: paymentData.metadata
        ? Object.keys(paymentData.metadata)
        : "none",
    });
    return;
  }

  const applicationId = extractionResult.applicationId;
  log.info(
    `Webhook: Extracted applicationId via ${extractionResult.method} for failed charge:`,
    applicationId,
  );

  try {
    // First, find the payment transaction by applicationId
    const { data: existingTransaction, error: queryError } = await supabase
      .from("payment_transactions")
      .select("id, status")
      .eq("application_id", applicationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (queryError || !existingTransaction) {
      log.error(
        "Webhook: No pending transaction found for failed charge:",
        applicationId,
        queryError?.message,
      );
      return;
    }

    // 1. Update the payment_transactions record to 'failed' and store all available info
    await supabase
      .from("payment_transactions")
      .update({
        status: "failed",
        paystack_reference: reference,
        paystack_status: paymentData.status,
        paystack_gateway_response: paymentData.gateway_response,
        fees: paymentData.fees ? paymentData.fees / 100 : null,
        metadata: paymentData, // Store the full failure payload
      })
      .eq("id", existingTransaction.id);

    // 2. Update the parent application's payment status to 'failed'
    await supabase
      .from("applications")
      .update({ payment_status: "failed" })
      .eq("id", applicationId);

    // 3. Update the user_application_status to 'payment_failed'
    await supabase
      .from("user_application_status")
      .update({ status: "payment_failed" })
      .eq("application_id", applicationId);

    log.info(
      `Webhook: Successfully logged failed payment for application ${applicationId}`,
    );
  } catch (error) {
    log.error(
      `Webhook: Error handling failed charge for application ${applicationId}`,
      error,
    );
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Server configuration error." });
  }

  let rawBody;
  try {
    rawBody = await buffer(req);
  } catch (error) {
    return res.status(400).json({ error: "Failed to parse request body" });
  }

  const hash = createHmac("sha512", secret).update(rawBody).digest("hex");

  const signature = req.headers["x-paystack-signature"];

  if (hash !== signature) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (error) {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const supabase = createAdminClient();

  // Process the event based on its type
  switch (event.event) {
    case "charge.success":
      log.info("Webhook received: charge.success", {
        hasReference: Boolean(event?.data?.reference),
        hasMetadata: Boolean(event?.data?.metadata),
      });
      await handleSuccessfulCharge(supabase, event.data);
      break;
    case "charge.failed":
      log.info("Webhook received: charge.failed", {
        hasReference: Boolean(event?.data?.reference),
        hasMetadata: Boolean(event?.data?.metadata),
      });
      await handleFailedCharge(supabase, event.data);
      break;
    default:
      log.info(`Unhandled webhook event type: ${event.event}`);
  }

  // Always return a 200 to Paystack to prevent them from retrying the webhook
  res.status(200).json({ received: true });
}
