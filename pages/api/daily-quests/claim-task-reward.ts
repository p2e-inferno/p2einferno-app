import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  WalletValidationError,
} from "@/lib/auth/privy";

const log = getLogger("api:daily-quests:claim-task-reward");

function isRunActiveWindow(run: any) {
  const now = Date.now();
  const starts = Date.parse(run.starts_at);
  const ends = Date.parse(run.ends_at);
  return run.status === "active" && now >= starts && now <= ends;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { completionId } = (req.body || {}) as { completionId?: string };
  if (!completionId) {
    return res.status(400).json({ error: "Missing completionId" });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = authUser.id;

    const rawActiveWalletHeader = req.headers?.["x-active-wallet"];
    if (Array.isArray(rawActiveWalletHeader)) {
      return res
        .status(400)
        .json({ error: "Multiple X-Active-Wallet headers provided" });
    }

    try {
      await extractAndValidateWalletFromHeader({
        userId,
        activeWalletHeader: rawActiveWalletHeader,
        context: "daily-quests:claim-task-reward",
        required: true,
      });
    } catch (walletErr: unknown) {
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Invalid X-Active-Wallet header";
      const status =
        walletErr instanceof WalletValidationError &&
        walletErr.code === "NOT_OWNED"
          ? 403
          : 400;
      return res.status(status).json({ error: message });
    }

    const supabase = createAdminClient();

    const { data: completion, error: completionErr } = await supabase
      .from("user_daily_task_completions")
      .select(
        "id,user_id,daily_quest_run_id,daily_quest_run_task_id,submission_status,reward_claimed",
      )
      .eq("id", completionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (completionErr || !completion) {
      return res.status(404).json({ error: "Completion not found" });
    }

    const { data: run, error: runErr } = await supabase
      .from("daily_quest_runs")
      .select("*")
      .eq("id", completion.daily_quest_run_id)
      .maybeSingle();
    if (runErr || !run) {
      return res.status(404).json({ error: "Run not found" });
    }

    if (!isRunActiveWindow(run)) {
      return res.status(409).json({ error: "RUN_CLOSED" });
    }

    const { data: runTask, error: taskErr } = await supabase
      .from("daily_quest_run_tasks")
      .select("id,reward_amount")
      .eq("id", completion.daily_quest_run_task_id)
      .eq("daily_quest_run_id", completion.daily_quest_run_id)
      .maybeSingle();
    if (taskErr || !runTask) {
      return res.status(404).json({ error: "Run task not found" });
    }

    const rewardAmount = Number(runTask.reward_amount || 0);
    if (!(rewardAmount > 0)) {
      return res.status(400).json({ error: "No reward configured for task" });
    }

    // Resolve user_profiles.id (uuid) required by award_xp_to_user RPC.
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("privy_user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      log.error("Failed to resolve user profile for XP award", {
        userId,
        profileError,
      });
      return res.status(500).json({ error: "User profile not found" });
    }
    const userProfileUuid = profile.id; // uuid

    const { data: updatedTask, error: updateError } = await supabase
      .from("user_daily_task_completions")
      .update({ reward_claimed: true })
      .eq("id", completionId)
      .eq("user_id", userId)
      .eq("submission_status", "completed")
      .eq("reward_claimed", false)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedTask) {
      // Already claimed or not found
      return res.status(409).json({
        error:
          "Reward already claimed, completion not found, or task not completed.",
      });
    }

    // XP increment gated behind the conditional returning result.
    const { error: xpError } = await supabase.rpc("award_xp_to_user", {
      p_user_id: userProfileUuid, // uuid from user_profiles.id, NOT the privy string userId
      p_xp_amount: rewardAmount,
      p_activity_type: "daily_quest_task_reward_claimed",
      p_activity_data: {
        daily_quest_run_id: completion.daily_quest_run_id,
        daily_quest_run_task_id: completion.daily_quest_run_task_id,
        completion_id: completionId,
      },
    });

    if (xpError) {
      // Compensating rollback so failed XP writes do not permanently burn claimability.
      await supabase
        .from("user_daily_task_completions")
        .update({ reward_claimed: false })
        .eq("id", completionId)
        .eq("user_id", userId);

      return res.status(503).json({
        error: "XP_AWARD_FAILED",
        message: "Reward claim was not finalized. Please retry.",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    log.error("Error in daily quest claim-task-reward API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
