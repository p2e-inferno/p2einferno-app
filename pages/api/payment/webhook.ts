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
  const applicationId = paymentData.metadata?.applicationId;
  const paymentReference = paymentData.reference;

  if (!applicationId) {
    console.error("Webhook: Received successful charge without an applicationId in metadata.", paymentData);
    return;
  }

  try {
    const { data, error } = await supabase.rpc('handle_successful_payment', {
      p_application_id: applicationId,
      p_payment_reference: paymentReference,
      p_payment_method: 'paystack',
      p_transaction_details: paymentData // Pass the entire Paystack data object
    });

    if (error || !data || !data[0].success) {
      console.error(`Webhook: Failed to process successful payment for application ${applicationId}`, error || data[0].message);
    } else {
      console.log(`Webhook: Successfully processed payment for application ${applicationId}`);
    }
  } catch (e) {
    console.error(`Webhook: Unhandled exception during successful payment processing for application ${applicationId}`, e);
  }
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("Paystack secret key is not set.");
    return res.status(500).json({ error: "Server configuration error." });
  }
  
  const rawBody = await buffer(req);
  const hash = createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");
  
  const signature = req.headers["x-paystack-signature"];
  if (hash !== signature) {
    console.warn("Invalid Paystack webhook signature received.");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = JSON.parse(rawBody.toString());
  const supabase = createAdminClient();

  // Process the event based on its type
  switch (event.event) {
    case "charge.success":
      await handleSuccessfulCharge(supabase, event.data);
      break;
    case "charge.failed":
      await handleFailedCharge(supabase, event.data);
      break;
    default:
      console.log(`Webhook: Received unhandled event type: ${event.event}`);
  }

  // Always return a 200 to Paystack to prevent them from retrying the webhook
  res.status(200).json({ received: true });
}