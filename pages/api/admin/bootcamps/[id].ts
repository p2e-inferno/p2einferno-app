import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const supabase = createAdminClient();

    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Bootcamp ID is required" });
    }

    switch (req.method) {
      case "DELETE":
        return await deleteBootcamp(res, supabase, id);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("Bootcamp API error:", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}

async function deleteBootcamp(
  res: NextApiResponse,
  supabase: any,
  bootcampId: string
) {
  try {
    const { error } = await supabase
      .from("bootcamp_programs")
      .delete()
      .eq("id", bootcampId);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Delete bootcamp error:", error);
    return res.status(400).json({ error: error.message || "Failed to delete" });
  }
}

export default withAdminAuth(handler);
