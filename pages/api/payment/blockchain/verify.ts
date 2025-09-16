import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:payment:blockchain:verify");

// Note: This endpoint is now a simple proxy to invoke the Edge Function.
// It can be secured with admin or user authentication as needed.
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
    const supabase = createAdminClient();

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

// Note: Add authentication as needed
export default handler;
