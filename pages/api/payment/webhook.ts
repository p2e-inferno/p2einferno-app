import { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { supabase } from "../../../lib/supabase";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const hash = createHash("sha512")
      .update(JSON.stringify(req.body) + process.env.PAYSTACK_SECRET_KEY)
      .digest("hex");

    const signature = req.headers["x-paystack-signature"];

    if (hash !== signature) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;

    // Handle different webhook events
    switch (event.event) {
      case "charge.success":
        await handleSuccessfulCharge(event.data);
        break;
      case "charge.failed":
        await handleFailedCharge(event.data);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleSuccessfulCharge(data: any) {
  try {
    const { reference } = data;

    // Update payment transaction
    const { data: transaction, error: updateError } = await supabase
      .from("payment_transactions")
      .update({
        status: "success",
        paystack_status: data.status,
        paystack_gateway_response: data.gateway_response,
        authorization_code: data.authorization?.authorization_code,
        customer_code: data.customer?.customer_code,
        payment_method: data.channel,
        channel: data.channel,
        card_type: data.authorization?.card_type,
        bank: data.authorization?.bank,
        fees: data.fees ? data.fees / 100 : null,
        paid_at: new Date(data.paid_at),
        metadata: { ...data },
      })
      .eq("paystack_reference", reference)
      .select("application_id")
      .single();

    if (updateError) {
      console.error("Failed to update payment transaction:", updateError);
      return;
    }

    // Update application status
    if (transaction) {
      await supabase
        .from("applications")
        .update({
          payment_status: "completed",
          application_status: "submitted",
        })
        .eq("id", transaction.application_id);
    }

  } catch (error) {
    console.error("Error handling successful charge:", error);
  }
}

async function handleFailedCharge(data: any) {
  try {
    const { reference } = data;

    // Update payment transaction
    await supabase
      .from("payment_transactions")
      .update({
        status: "failed",
        paystack_status: data.status,
        paystack_gateway_response: data.gateway_response,
        metadata: { ...data },
      })
      .eq("paystack_reference", reference);

  } catch (error) {
    console.error("Error handling failed charge:", error);
  }
}