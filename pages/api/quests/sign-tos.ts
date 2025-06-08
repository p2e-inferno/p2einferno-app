import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    userId,
    walletAddress,
    signature,
    message,
    tosVersion = "1.0.0",
  } = req.body;

  if (!userId || !walletAddress || !signature || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = createAdminClient();

    // Check if TOS already signed for this version
    const { data: existingSignature } = await supabase
      .from("tos_signatures")
      .select("*")
      .eq("user_id", userId)
      .eq("tos_version", tosVersion)
      .single();

    if (existingSignature) {
      return res
        .status(400)
        .json({ error: "Terms of Service already signed for this version" });
    }

    // Store the signature
    const { error } = await supabase.from("tos_signatures").insert({
      user_id: userId,
      wallet_address: walletAddress,
      signature,
      message,
      tos_version: tosVersion,
    });

    if (error) {
      console.error("Error storing TOS signature:", error);
      return res.status(500).json({ error: "Failed to store signature" });
    }

    res
      .status(200)
      .json({ success: true, message: "Terms of Service signed successfully" });
  } catch (error) {
    console.error("Error in TOS signing API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
