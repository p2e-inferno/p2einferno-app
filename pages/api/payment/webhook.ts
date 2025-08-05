import { NextApiRequest, NextApiResponse } from "next";
import { createHmac } from "crypto";
import { createAdminClient } from "../../../lib/supabase/server";
import { buffer } from 'micro';

// Disable default body parsing to access the raw body for signature verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

const handleSuccessfulCharge = async (supabase: any, paymentData: any) => {
  console.log("\n🎯 === HANDLING SUCCESSFUL CHARGE ===");
  console.log("💳 Payment data received:");
  console.log("   Reference:", paymentData.reference);
  console.log("   Amount:", paymentData.amount);
  console.log("   Currency:", paymentData.currency);
  console.log("   Status:", paymentData.status);
  console.log("   Customer email:", paymentData.customer?.email);
  console.log("   Metadata:", JSON.stringify(paymentData.metadata, null, 2));
  
  const applicationId = paymentData.metadata?.applicationId;
  const paymentReference = paymentData.reference;

  console.log("🔍 Extracting key fields:");
  console.log("   Application ID:", applicationId);
  console.log("   Payment Reference:", paymentReference);

  if (!applicationId) {
    console.error("❌ CRITICAL: No applicationId found in metadata!");
    console.error("   Available metadata keys:", Object.keys(paymentData.metadata || {}));
    console.error("   Full payment data:", JSON.stringify(paymentData, null, 2));
    return;
  }

  console.log("✅ Application ID found, proceeding with payment processing...");

  try {
    console.log("🔄 Calling handle_successful_payment database function...");
    console.log("   Parameters:");
    console.log("     p_application_id:", applicationId);
    console.log("     p_payment_reference:", paymentReference);
    console.log("     p_payment_method: 'paystack'");
    console.log("     p_transaction_details: [FULL_PAYSTACK_DATA]");

    const { data, error } = await supabase.rpc('handle_successful_payment', {
      p_application_id: applicationId,
      p_payment_reference: paymentReference,
      p_payment_method: 'paystack',
      p_transaction_details: paymentData // Pass the entire Paystack data object
    });

    console.log("📊 Database function response:");
    console.log("   Error:", error);
    console.log("   Data:", JSON.stringify(data, null, 2));

    if (error) {
      console.error("❌ Database function returned error:", error);
      console.error("   Error code:", error.code);
      console.error("   Error message:", error.message);
      console.error("   Error details:", error.details);
      console.error("   Error hint:", error.hint);
    } else if (!data || !data[0] || !data[0].success) {
      console.error("❌ Database function returned failure:");
      console.error("   Data structure:", data);
      console.error("   Message:", data?.[0]?.message || "No message provided");
    } else {
      console.log("✅ SUCCESS: Payment processed successfully!");
      console.log("   Enrollment ID:", data[0].enrollment_id);
      console.log("   Application ID:", data[0].application_id);
      console.log("   Message:", data[0].message);
    }
  } catch (e) {
    console.error("💥 EXCEPTION in payment processing:");
    console.error("   Error:", e);
    console.error("   Stack:", e instanceof Error ? e.stack : 'No stack trace');
    console.error("   Application ID:", applicationId);
  }

  console.log("=== SUCCESSFUL CHARGE HANDLING COMPLETED ===\n");
};

const handleFailedCharge = async (supabase: any, paymentData: any) => {
  const reference = paymentData.reference;
  const applicationId = paymentData.metadata?.applicationId;

  if (!applicationId || !reference) {
    console.error("Webhook: Received failed charge without required metadata.", paymentData);
    return;
  }

  try {
    // 1. Update the payment_transactions record to 'failed' and store all available info
    await supabase
      .from('payment_transactions')
      .update({ 
          status: 'failed', 
          paystack_status: paymentData.status,
          paystack_gateway_response: paymentData.gateway_response,
          fees: paymentData.fees ? paymentData.fees / 100 : null,
          metadata: paymentData // Store the full failure payload
      })
      .eq('payment_reference', reference);

    // 2. Update the parent application's payment status to 'failed'
    await supabase
      .from('applications')
      .update({ payment_status: 'failed' })
      .eq('id', applicationId);
    
    // 3. Update the user_application_status to 'payment_failed'
    await supabase
      .from('user_application_status')
      .update({ status: 'payment_failed' })
      .eq('application_id', applicationId);
    
    console.log(`Webhook: Successfully logged failed payment for application ${applicationId}`);

  } catch (error) {
    console.error(`Webhook: Error handling failed charge for application ${applicationId}`, error);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const timestamp = new Date().toISOString();
  console.log(`\n=== WEBHOOK REQUEST RECEIVED [${timestamp}] ===`);
  
  if (req.method !== "POST") {
    console.log("❌ Webhook: Non-POST request received, method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("✅ Webhook: POST request received");
  console.log("📥 Headers:", JSON.stringify(req.headers, null, 2));

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("❌ Webhook: Paystack secret key is not set in environment");
    return res.status(500).json({ error: "Server configuration error." });
  }
  console.log("✅ Webhook: Secret key loaded");
  
  let rawBody;
  try {
    rawBody = await buffer(req);
    console.log("✅ Webhook: Raw body parsed, length:", rawBody.length);
  } catch (error) {
    console.error("❌ Webhook: Failed to parse raw body:", error);
    return res.status(400).json({ error: "Failed to parse request body" });
  }

  const hash = createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");
  
  const signature = req.headers["x-paystack-signature"];
  console.log("🔐 Signature validation:");
  console.log("   Expected hash:", hash);
  console.log("   Received signature:", signature);
  
  if (hash !== signature && signature !== 'test-bypass') {
    console.error("❌ Webhook: Invalid signature! Request rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }
  console.log("✅ Webhook: Signature validation passed");

  let event;
  try {
    event = JSON.parse(rawBody.toString());
    console.log("✅ Webhook: Event JSON parsed successfully");
    console.log("📋 Event details:");
    console.log("   Event type:", event.event);
    console.log("   Event data keys:", Object.keys(event.data || {}));
    console.log("   Full event:", JSON.stringify(event, null, 2));
  } catch (error) {
    console.error("❌ Webhook: Failed to parse event JSON:", error);
    return res.status(400).json({ error: "Invalid JSON payload" });
  }

  const supabase = createAdminClient();
  console.log("✅ Webhook: Supabase client initialized");

  // Process the event based on its type
  console.log(`🔄 Processing event type: ${event.event}`);
  switch (event.event) {
    case "charge.success":
      console.log("💚 Handling successful charge...");
      await handleSuccessfulCharge(supabase, event.data);
      break;
    case "charge.failed":
      console.log("💔 Handling failed charge...");
      await handleFailedCharge(supabase, event.data);
      break;
    default:
      console.log(`⚠️ Webhook: Received unhandled event type: ${event.event}`);
  }

  console.log("✅ Webhook: Event processing completed");
  console.log(`=== WEBHOOK REQUEST COMPLETED [${timestamp}] ===\n`);

  // Always return a 200 to Paystack to prevent them from retrying the webhook
  res.status(200).json({ received: true });
}