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
    // The webhook will have updated this. We poll this endpoint from the frontend.
    const { data: transaction, error } = await supabase
      .from('payment_transactions')
      .select('status, application_id')
      .eq('payment_reference', reference)
      .single();

    if (error || !transaction) {
      return res.status(404).json({ status: 'pending', message: 'Transaction not yet found.' });
    }

    res.status(200).json({
      success: transaction.status === 'success',
      message: transaction.status === 'success' ? 'Payment verified successfully' : 'Payment verification pending',
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
