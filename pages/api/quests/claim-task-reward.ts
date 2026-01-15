import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getPrivyUser } from "@/lib/auth/privy";

const log = getLogger("api:quests:claim-task-reward");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { completionId } = req.body;

  if (!completionId) {
    return res.status(400).json({ error: "Completion ID is required" });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = authUser.id;
    const supabase = createAdminClient();

    // Check if the completion exists and hasn't been claimed yet
    const { data: completion, error: completionError } = await supabase
      .from("user_task_completions")
      .select(
        `
        id,
        user_id,
        quest_id,
        task_id,
        reward_claimed,
        submission_status,
        verification_data,
        quest_tasks!user_task_completions_task_id_fkey (
          reward_amount,
          task_type
        ),
        user_profiles!user_task_completions_user_id_fkey (
          id
        )
      `,
      )
      .eq("id", completionId)
      .single();

    if (completionError || !completion) {
      return res.status(404).json({ error: "Task completion not found" });
    }

    if (completion.user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to claim this reward" });
    }

    if (completion.reward_claimed) {
      return res.status(400).json({ error: "Reward already claimed" });
    }

    // SECURITY: Only allow claiming rewards for completed tasks
    if (completion.submission_status !== "completed") {
      return res.status(403).json({
        error: "Task must be approved before claiming reward",
        currentStatus: completion.submission_status,
      });
    }

    // Update the completion to mark reward as claimed
    const { error: updateError } = await supabase
      .from("user_task_completions")
      .update({ reward_claimed: true })
      .eq("id", completionId);

    if (updateError) {
      log.error("Error updating completion:", updateError);
      return res.status(500).json({
        error: "Failed to claim reward",
        details: updateError.message,
      });
    }

    const questTask = Array.isArray(completion.quest_tasks)
      ? completion.quest_tasks[0]
      : completion.quest_tasks;
    const baseReward = questTask?.reward_amount || 0;

    // For deploy_lock tasks, apply network-based reward multiplier
    let rewardAmount = baseReward;
    if (questTask?.task_type === "deploy_lock") {
      const verificationData = completion.verification_data as
        | { rewardMultiplier?: number }
        | null;
      const multiplier = verificationData?.rewardMultiplier || 1.0;
      rewardAmount = Math.floor(baseReward * multiplier);

      log.info("Applied deploy_lock reward multiplier", {
        completionId,
        baseReward,
        multiplier,
        finalReward: rewardAmount,
      });
    }

    // Award XP to the user (same pattern as milestone task claims)
    const userProfile = Array.isArray(completion.user_profiles)
      ? completion.user_profiles[0]
      : completion.user_profiles;

    if (rewardAmount > 0 && userProfile?.id) {
      // Get current experience points first
      const { data: currentProfile, error: fetchErr } = await supabase
        .from("user_profiles")
        .select("experience_points")
        .eq("id", userProfile.id)
        .single();

      if (fetchErr) {
        log.error("Failed to fetch current experience points:", fetchErr);
        return res
          .status(500)
          .json({ error: "Failed to update experience points" });
      }

      // Update experience points with the new total
      const newExperiencePoints =
        (currentProfile?.experience_points || 0) + rewardAmount;
      const { error: xpErr } = await supabase
        .from("user_profiles")
        .update({
          experience_points: newExperiencePoints,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userProfile.id);

      if (xpErr) {
        log.error("Failed to increment experience points:", xpErr);
        return res
          .status(500)
          .json({ error: "Failed to update experience points" });
      }

      // Insert activity record (best-effort)
      const { error: actErr } = await supabase.from("user_activities").insert({
        user_profile_id: userProfile.id,
        activity_type: "quest_task_reward_claimed",
        activity_data: {
          quest_id: completion.quest_id,
          task_id: completion.task_id,
          completion_id: completion.id,
          reward_amount: rewardAmount,
        },
        points_earned: rewardAmount,
      } as any);

      if (actErr) {
        log.error("Failed to insert user activity:", actErr);
        // Don't fail the transaction, but log the error
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully claimed ${rewardAmount} DG tokens`,
      rewardAmount,
    });
  } catch (error) {
    log.error("Error in claim task reward API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
