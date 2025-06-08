import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, questId, taskId, verificationData } = req.body;

  if (!userId || !questId || !taskId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = createAdminClient();

    // Check if task is already completed
    const { data: existingCompletion } = await supabase
      .from("user_task_completions")
      .select("*")
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .single();

    if (existingCompletion) {
      return res.status(400).json({ error: "Task already completed" });
    }

    // Complete the task
    const { error: completionError } = await supabase
      .from("user_task_completions")
      .insert({
        user_id: userId,
        quest_id: questId,
        task_id: taskId,
        verification_data: verificationData,
        reward_claimed: false,
      });

    if (completionError) {
      console.error("Error completing task:", completionError);
      return res.status(500).json({ error: "Failed to complete task" });
    }

    // Update or create quest progress
    const { data: existingProgress } = await supabase
      .from("user_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_id", questId)
      .single();

    if (existingProgress) {
      // Update existing progress
      const { error: updateError } = await supabase
        .from("user_quest_progress")
        .update({
          tasks_completed: existingProgress.tasks_completed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("quest_id", questId);

      if (updateError) {
        console.error("Error updating progress:", updateError);
      }
    } else {
      // Create new progress entry
      const { error: insertError } = await supabase
        .from("user_quest_progress")
        .insert({
          user_id: userId,
          quest_id: questId,
          tasks_completed: 1,
          is_completed: false,
        });

      if (insertError) {
        console.error("Error creating progress:", insertError);
      }
    }

    res
      .status(200)
      .json({ success: true, message: "Task completed successfully" });
  } catch (error) {
    console.error("Error in complete task API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
