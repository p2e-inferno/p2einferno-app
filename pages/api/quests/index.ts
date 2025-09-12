import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:quests:index");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();

    const { data: quests, error } = await supabase
      .from("quests")
      .select(
        `
        *,
        quest_tasks!quest_tasks_quest_id_fkey (
          id,
          title,
          description,
          task_type,
          verification_method,
          reward_amount,
          order_index,
          created_at
        )
      `,
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("Error fetching quests:", error);
      return res.status(500).json({
        error: "Failed to fetch quests",
        details: error.message,
        code: error.code,
      });
    }

    res.status(200).json({ quests });
  } catch (error) {
    log.error("Error in quests API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
