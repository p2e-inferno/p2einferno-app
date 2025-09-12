import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:bootcamps:[id]");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const supabase = createAdminClient();

    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Bootcamp ID is required" });
    }

    switch (req.method) {
      case "GET":
        return await getBootcamp(res, supabase, id);
      case "DELETE":
        return await deleteBootcamp(res, supabase, id);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    log.error("Bootcamp API error:", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}

async function getBootcamp(
  res: NextApiResponse,
  supabase: any,
  bootcampId: string,
) {
  try {
    const { data, error } = await supabase
      .from("bootcamp_programs")
      .select("*")
      .eq("id", bootcampId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: "Bootcamp not found" });
    }

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    log.error("Get bootcamp error:", error);
    return res
      .status(400)
      .json({ error: error.message || "Failed to fetch bootcamp" });
  }
}

async function deleteBootcamp(
  res: NextApiResponse,
  supabase: any,
  bootcampId: string,
) {
  try {
    const { error } = await supabase
      .from("bootcamp_programs")
      .delete()
      .eq("id", bootcampId);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    log.error("Delete bootcamp error:", error);
    return res.status(400).json({ error: error.message || "Failed to delete" });
  }
}

export default withAdminAuth(handler);
