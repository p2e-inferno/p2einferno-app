// Path: p2einferno-app/pages/api/payment/verify/[reference].ts
import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";

const supabase = createAdminClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { reference } = req.query;

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: "Invalid payment reference" });
    }

    // Check the status of the transaction in our database.
    // This endpoint only checks what the webhook has updated - no direct Paystack API calls
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('status, application_id, created_at')
      .eq('payment_reference', reference)
      .single();

    if (error || !transaction) {
      // Transaction not found - either invalid reference or webhook hasn't processed yet
      return res.status(200).json({ 
        success: false,
        status: 'pending', 
        message: 'Payment is being processed. Please wait...' 
      });
    }

    // Return the current status from our database (set by webhook)
    res.status(200).json({
      success: transaction.status === 'success',
      message: transaction.status === 'success' 
        ? 'Payment verified successfully' 
        : transaction.status === 'failed'
        ? 'Payment failed'
        : 'Payment is being processed',
      data: {
        status: transaction.status,
        applicationId: transaction.application_id,
      }
    });
  } catch (error) {
    console.error("Payment status check error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
