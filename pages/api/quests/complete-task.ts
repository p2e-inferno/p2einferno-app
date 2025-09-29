import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { createPrivyClient } from "@/lib/utils/privyUtils";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:quests:complete-task");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    userId: _ignoreUserId,
    questId,
    taskId,
    verificationData: clientVerificationData,
    inputData,
  } = req.body;

  if (!questId || !taskId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = createAdminClient();

    // Verify Privy user from token in header or cookie
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const effectiveUserId = authUser.id;

    // Check if task is already completed
    const { data: existingCompletion } = await supabase
      .from("user_task_completions")
      .select("*")
      .eq("user_id", effectiveUserId)
      .eq("task_id", taskId)
      .single();

    if (existingCompletion) {
      return res.status(400).json({ error: "Task already completed" });
    }

    // Get the task details to check type and review requirements
    const { data: task, error: taskError } = await supabase
      .from("quest_tasks")
      .select("requires_admin_review, input_required, task_type")
      .eq("id", taskId)
      .single();

    if (taskError) {
      log.error("Error fetching task:", taskError);
      return res.status(500).json({ error: "Failed to fetch task details" });
    }

    // Determine initial status
    const initialStatus = task?.requires_admin_review ? "pending" : "completed";

    // Build verification data
    let verificationData = clientVerificationData;
    if (task?.task_type === "link_farcaster") {
      // Verify Farcaster linkage via Privy server SDK and use server-trusted data
      const privy = createPrivyClient();
      const profile: any = await privy.getUserById(effectiveUserId);
      const farcasterAccount = profile?.linkedAccounts?.find(
        (a: any) => a?.type === "farcaster" && a?.fid,
      );
      if (!farcasterAccount) {
        return res
          .status(400)
          .json({ error: "Farcaster not linked to your Privy account" });
      }
      verificationData = {
        fid: farcasterAccount.fid,
        username: farcasterAccount.username,
      };
    }

    // Complete the task
    const { error: completionError } = await supabase
      .from("user_task_completions")
      .insert({
        user_id: effectiveUserId,
        quest_id: questId,
        task_id: taskId,
        verification_data: verificationData,
        submission_data: inputData,
        submission_status: initialStatus,
        reward_claimed: false,
      });

    if (completionError) {
      log.error("Error completing task:", completionError);
      return res.status(500).json({ error: "Failed to complete task" });
    }

    // Update quest progress only if task is completed (not pending review)
    if (initialStatus === "completed") {
      // Use the database function to recalculate progress
      try {
        await supabase.rpc("recalculate_quest_progress", {
          p_user_id: effectiveUserId,
          p_quest_id: questId,
        });
      } catch (progressError) {
        log.error("Error recalculating progress:", progressError);
        // Don't fail the main operation if progress update fails
      }
    }

    res
      .status(200)
      .json({ success: true, message: "Task completed successfully" });
  } catch (error) {
    log.error("Error in complete task API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
