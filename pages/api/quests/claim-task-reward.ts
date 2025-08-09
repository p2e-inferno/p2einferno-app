import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { completionId } = req.body;

  if (!completionId) {
    return res.status(400).json({ error: "Completion ID is required" });
  }

  try {
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
        quest_tasks!user_task_completions_task_id_fkey (
          reward_amount
        ),
        user_profiles!user_task_completions_user_id_fkey (
          id
        )
      `
      )
      .eq("id", completionId)
      .single();

    if (completionError || !completion) {
      return res.status(404).json({ error: "Task completion not found" });
    }

    if (completion.reward_claimed) {
      return res.status(400).json({ error: "Reward already claimed" });
    }

    // Update the completion to mark reward as claimed
    const { error: updateError } = await supabase
      .from("user_task_completions")
      .update({ reward_claimed: true })
      .eq("id", completionId);

    if (updateError) {
      console.error("Error updating completion:", updateError);
      return res.status(500).json({
        error: "Failed to claim reward",
        details: updateError.message,
      });
    }
    
    const questTask = Array.isArray(completion.quest_tasks) ? completion.quest_tasks[0] : completion.quest_tasks;
    const rewardAmount = questTask?.reward_amount || 0;

    // Award XP to the user by calling the RPC function
    const userProfile = Array.isArray(completion.user_profiles) ? completion.user_profiles[0] : completion.user_profiles;
    const { error: rpcError } = await supabase.rpc('award_xp_to_user', {
      p_user_id: userProfile?.id,
      p_xp_amount: rewardAmount,
      p_activity_type: 'task_reward_claimed',
      p_activity_data: {
        quest_id: completion.quest_id,
        task_id: completion.task_id,
        completion_id: completion.id,
        reward_amount: rewardAmount
      }
    });
    
    if (rpcError) {
      console.error("Error awarding XP:", rpcError);
      // Don't fail the transaction, but log the error
    }

    res.status(200).json({
      success: true,
      message: `Successfully claimed ${rewardAmount} DG tokens`,
      rewardAmount,
    });
  } catch (error) {
    console.error("Error in claim task reward API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
