import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId, questId, taskId, verificationData, inputData } = req.body;

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

    // Get the task details to check if it requires admin review
    const { data: task, error: taskError } = await supabase
      .from("quest_tasks")
      .select("requires_admin_review, input_required")
      .eq("id", taskId)
      .single();

    if (taskError) {
      console.error("Error fetching task:", taskError);
      return res.status(500).json({ error: "Failed to fetch task details" });
    }

    // Determine initial status
    const initialStatus = task?.requires_admin_review ? "pending" : "completed";

    // Complete the task
    const { error: completionError } = await supabase
      .from("user_task_completions")
      .insert({
        user_id: userId,
        quest_id: questId,
        task_id: taskId,
        verification_data: verificationData,
        submission_data: inputData,
        submission_status: initialStatus,
        reward_claimed: false,
      });

    if (completionError) {
      console.error("Error completing task:", completionError);
      return res.status(500).json({ error: "Failed to complete task" });
    }

    // Update quest progress only if task is completed (not pending review)
    if (initialStatus === "completed") {
      // Use the database function to recalculate progress
      try {
        await supabase.rpc("recalculate_quest_progress", {
          p_user_id: userId,
          p_quest_id: questId,
        });
      } catch (progressError) {
        console.error("Error recalculating progress:", progressError);
        // Don't fail the main operation if progress update fails
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
