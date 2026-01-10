import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";
import { getPrivyUser } from "@/lib/auth/privy";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { grantKeyToUser } from "@/lib/services/user-key-service";

const log = getLogger("api:quests:complete-quest");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { questId } = req.body;
  if (!questId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = authUser.id;
    const supabase = createAdminClient();

    // Get quest details and check if user can complete quest
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select("*")
      .eq("id", questId)
      .single();

    if (questError || !quest) {
      return res.status(404).json({ error: "Quest not found" });
    }

    // Check prerequisites before allowing quest completion
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
      return res.status(400).json({ error: "Quest already completed" });
    }

    // Grant quest completion key if lock is configured
    if (!quest.lock_address) {
      log.error("Quest is missing lock address for completion key", {
        questId,
      });
      return res.status(500).json({
        error: "Quest is not configured with a completion lock address",
      });
    }

    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      return res.status(500).json({
        error: "Server wallet not configured for key granting",
      });
    }

    const publicClient = createPublicClientUnified();

    const grantResult = await grantKeyToUser(
      walletClient,
      publicClient,
      userId,
      quest.lock_address,
    );

    if (!grantResult.success) {
      log.error("Quest key grant failed", {
        questId,
        userId,
        error: grantResult.error,
      });
      return res.status(500).json({
        error:
          grantResult.error ||
          "Failed to grant quest completion key on-chain. Please try again.",
      });
    }

    // Mark quest as completed for the user
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
      log.error("Error updating quest progress after completion:", updateError);
      // Don't fail the response if key was successfully granted
    }

    return res.status(200).json({
      success: true,
      message: "Quest completed and key granted successfully",
      transactionHash: grantResult.transactionHash,
    });
  } catch (error) {
    log.error("Error in complete quest API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
