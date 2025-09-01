import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, questId } = req.body;

  if (!userId || !questId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = createAdminClient();

    // Get quest details and check if user can claim rewards
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select("*")
      .eq("id", questId)
      .single();

    if (questError || !quest) {
      return res.status(404).json({ error: "Quest not found" });
    }

    // Get user progress
    const { data: progress, error: progressError } = await supabase
      .from("user_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_id", questId)
      .single();

    if (progressError || !progress) {
      return res.status(404).json({ error: "Quest progress not found" });
    }

    // Get quest tasks count
    const { data: tasks, error: tasksError } = await supabase
      .from("quest_tasks")
      .select("id")
      .eq("quest_id", questId);

    if (tasksError) {
      return res.status(500).json({ error: "Failed to fetch quest tasks" });
    }

    const totalTasks = tasks?.length || 0;
    const isQuestComplete = progress.tasks_completed >= totalTasks;

    if (!isQuestComplete) {
      return res.status(400).json({ error: "Quest not completed yet" });
    }

    if (progress.reward_claimed) {
      return res.status(400).json({ error: "Rewards already claimed" });
    }

    // Mark rewards as claimed
    const { error: updateError } = await supabase
      .from("user_quest_progress")
      .update({
        reward_claimed: true,
        is_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("quest_id", questId);

    if (updateError) {
      console.error("Error claiming rewards:", updateError);
      return res.status(500).json({ error: "Failed to claim rewards" });
    }

    // Update individual task completions to mark rewards as claimed
    const { error: taskUpdateError } = await supabase
      .from("user_task_completions")
      .update({ reward_claimed: true })
      .eq("user_id", userId)
      .eq("quest_id", questId);

    if (taskUpdateError) {
      console.error("Error updating task rewards:", taskUpdateError);
    }

    res.status(200).json({
      success: true,
      message: "Rewards claimed successfully",
      totalReward: quest.total_reward,
    });
  } catch (error) {
    console.error("Error in claim rewards API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
