import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:quests:[id]:can-delete");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Quest ID is required" });
    }

    const supabase = createAdminClient();

    // Check if quest has any user progress
    const { count, error } = await supabase
      .from("user_quest_progress")
      .select("*", { count: "exact", head: true })
      .eq("quest_id", id);

    if (error) {
      log.error("Error checking quest deletion status:", error);
      throw error;
    }

    if (count && count > 0) {
      return res.status(200).json({
        canDelete: false,
        reason: "quest_has_user_progress",
        message: `Cannot delete quest with ${count} user${count > 1 ? "s" : ""} who have started it. Deactivate the quest instead.`,
        userCount: count,
      });
    }

    return res.status(200).json({
      canDelete: true,
    });
  } catch (error: any) {
    log.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

export default withAdminAuth(handler);
