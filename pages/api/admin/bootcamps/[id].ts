import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Auth
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const supabase = createAdminClient();

    // Verify admin role via user_profiles metadata.role === 'admin'
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("metadata")
      .eq("privy_user_id", user.id)
      .single();

    if (!profile || profile.metadata?.role !== "admin") {
      return res.status(403).json({ error: "Admins only" });
    }

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
