import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:quests:user-progress");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const supabase = createAdminClient();

    // Fetch user quest progress
    const { data: progress, error: progressError } = await supabase
      .from("user_quest_progress")
      .select("*")
      .eq("user_id", userId);

    if (progressError) {
      log.error("Error fetching progress:", progressError);
      return res.status(500).json({ error: "Failed to fetch progress" });
    }

    // Fetch completed tasks
    const { data: completedTasks, error: tasksError } = await supabase
      .from("user_task_completions")
      .select("*")
      .eq("user_id", userId);

    if (tasksError) {
      log.error("Error fetching completed tasks:", tasksError);
      return res.status(500).json({ error: "Failed to fetch completed tasks" });
    }

    res.status(200).json({ progress, completedTasks });
  } catch (error) {
    log.error("Error in user progress API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
