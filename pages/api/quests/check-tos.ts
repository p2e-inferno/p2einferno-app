import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, tosVersion = "1.0.0" } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const supabase = createAdminClient();

    const { data: signature } = await supabase
      .from("tos_signatures")
      .select("*")
      .eq("user_id", userId)
      .eq("tos_version", tosVersion)
      .single();

    res.status(200).json({ signed: !!signature });
  } catch (error) {
    console.error("Error checking TOS status:", error);
    res.status(200).json({ signed: false });
  }
}
