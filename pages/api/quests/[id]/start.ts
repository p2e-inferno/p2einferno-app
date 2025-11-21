import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getPrivyUser } from "@/lib/auth/privy";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";

const log = getLogger("api:quests:[id]:start");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "Quest ID is required" });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = authUser.id;
    const supabase = createAdminClient();

    // Check if quest exists and is active
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select(
        "id, title, is_active, prerequisite_quest_id, prerequisite_quest_lock_address, requires_prerequisite_key",
      )
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

    // Ensure prerequisites are met before starting a new quest
    const userWallet = await getUserPrimaryWallet(supabase, userId);
    const prereqCheck = await checkQuestPrerequisites(
      supabase,
      userId,
      userWallet,
      {
        prerequisite_quest_id: quest.prerequisite_quest_id,
        prerequisite_quest_lock_address: quest.prerequisite_quest_lock_address,
        requires_prerequisite_key: quest.requires_prerequisite_key,
      },
    );

    if (!prereqCheck.canProceed) {
      return res.status(403).json({
        error: prereqCheck.reason || "Prerequisites not met",
        prerequisiteState: prereqCheck.prerequisiteState,
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
      log.error("Error creating quest progress:", progressError);
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
    log.error("Error in start quest API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
