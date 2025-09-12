import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:payment:blockchain:status:[reference]");

// Returns current status for a blockchain payment by payment_reference.
// success -> { success: true, status: 'success', applicationId }
// pending -> { success: false, status: 'pending' }
// failed  -> { success: false, status: 'failed' }
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference } = req.query;
  if (!reference || typeof reference !== "string") {
    return res.status(400).json({ error: "Missing or invalid reference" });
  }

  try {
    const supabase = createAdminClient();

    // Look up the payment transaction by reference
    const { data: tx, error } = await supabase
      .from("payment_transactions")
      .select("status, application_id")
      .eq("payment_reference", reference)
      .single();

    if (error || !tx) {
      return res.status(200).json({ success: false, status: "not_found" });
    }

    // Normalize statuses to a small set for the client
    const status = tx.status as string;

    if (status === "success") {
      return res.status(200).json({
        success: true,
        status: "success",
        applicationId: tx.application_id,
      });
    }

    if (status === "failed" || status === "abandoned") {
      return res.status(200).json({ success: false, status: "failed" });
    }

    // pending | processing (still underway)
    return res.status(200).json({ success: false, status: "pending" });
  } catch (e) {
    log.error("Blockchain status check error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
