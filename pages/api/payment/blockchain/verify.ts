import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  fetchAndVerifyAuthorization,
  createPrivyClient,
} from "@/lib/utils/privyUtils";
import { assertApplicationOwnership } from "@/lib/auth/ownership";

const log = getLogger("api:payment:blockchain:verify");

// Note: This endpoint is now a simple proxy to invoke the Edge Function.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { transactionHash, applicationId, paymentReference } = req.body;

  if (!transactionHash || !applicationId || !paymentReference) {
    return res.status(400).json({
      error:
        "Missing required fields: transactionHash, applicationId, paymentReference",
    });
  }

  try {
    const privy = createPrivyClient();
    const claims = await fetchAndVerifyAuthorization(req, res, privy);
    if (!claims || !("appId" in claims)) return claims; // Early return handled by helper

    const supabase = createAdminClient();

    // Ensure the authenticated user owns this application
    const ownership = await assertApplicationOwnership(
      supabase,
      applicationId,
      claims,
    );
    if (!ownership.ok) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Minimal guard: ensure the payment reference belongs to the application
    const { data: tx, error: txErr } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("payment_reference", paymentReference)
      .eq("application_id", applicationId)
      .maybeSingle();

    if (txErr) {
      log.error(
        "DB error looking up payment reference before verification",
        txErr,
      );
      return res.status(500).json({ error: "Database error" });
    }
    if (!tx) {
      return res
        .status(404)
        .json({ error: "Payment reference not found for application" });
    }

    // Invoke the Edge Function asynchronously. We don't wait for it to complete.
    const { error } = await supabase.functions.invoke(
      "verify-blockchain-payment",
      {
        body: { transactionHash, applicationId, paymentReference },
      },
    );

    if (error) {
      throw new Error(`Failed to invoke Edge Function: ${error.message}`);
    }

    // Immediately respond to the client that the verification is processing.
    res.status(202).json({
      success: true,
      status: "processing",
      message:
        "Verification is processing in the background. You will be notified upon completion.",
    });
  } catch (error: any) {
    log.error("Error invoking blockchain verification Edge Function:", {
      message: error?.message,
      stack: error?.stack,
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

export default handler;
