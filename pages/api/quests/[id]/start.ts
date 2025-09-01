import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const { userId } = req.body;

  if (!id || !userId) {
    return res.status(400).json({ error: "Quest ID and user ID are required" });
  }

  try {
    const supabase = createAdminClient();

    // Check if quest exists and is active
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select("id, title, is_active")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (questError || !quest) {
      return res.status(404).json({ error: "Quest not found or not active" });
    }

    // Check if user has already started this quest
    const { data: existingProgress } = await supabase
      .from("user_quest_progress")
      .select("id")
      .eq("user_id", userId)
      .eq("quest_id", id)
      .single();

    if (existingProgress) {
      return res.status(200).json({
        success: true,
        message: "Quest already started",
        progress: existingProgress,
      });
    }

    // Create initial quest progress record
    const { data: progress, error: progressError } = await supabase
      .from("user_quest_progress")
      .insert({
        user_id: userId,
        quest_id: id,
        tasks_completed: 0,
        is_completed: false,
        reward_claimed: false,
      })
      .select()
      .single();

    if (progressError) {
      console.error("Error creating quest progress:", progressError);
      return res.status(500).json({
        error: "Failed to start quest",
        details: progressError.message,
      });
    }

    res.status(200).json({
      success: true,
      message: "Quest started successfully",
      progress,
    });
  } catch (error) {
    console.error("Error in start quest API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
