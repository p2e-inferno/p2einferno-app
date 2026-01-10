import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getPrivyUser } from "@/lib/auth/privy";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";

const log = getLogger("api:quests:[id]");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Quest ID is required" });
  }

  try {
    const supabase = createAdminClient();
    const authUser = await getPrivyUser(req);
    const userId = authUser?.id || null;
    const userWallet = userId
      ? await getUserPrimaryWallet(supabase, userId)
      : null;

    // Fetch quest with its tasks
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select(
        `
        *,
        quest_tasks!quest_tasks_quest_id_fkey (
          id,
          title,
          description,
          task_type,
          verification_method,
          reward_amount,
          order_index,
          input_required,
          input_label,
          input_placeholder,
          input_validation,
          requires_admin_review,
          task_config,
          created_at
        )
      `,
      )
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (questError) {
      log.error("Error fetching quest:", questError);
      return res.status(500).json({
        error: "Failed to fetch quest",
        details: questError.message,
      });
    }

    if (!quest) {
      return res.status(404).json({ error: "Quest not found" });
    }

    let progress = null;
    let completions: any[] = [];

    if (userId) {
      const prereqCheck = await checkQuestPrerequisites(
        supabase,
        userId,
        userWallet,
        {
          prerequisite_quest_id: quest.prerequisite_quest_id || null,
          prerequisite_quest_lock_address:
            quest.prerequisite_quest_lock_address || null,
          requires_prerequisite_key: quest.requires_prerequisite_key ?? false,
        },
      );

      (quest as any).can_start = prereqCheck.canProceed;
      (quest as any).prerequisite_state =
        prereqCheck.prerequisiteState ||
        (quest.prerequisite_quest_id || quest.prerequisite_quest_lock_address
          ? "missing_completion"
          : "none");
    }

    // If userId is provided, fetch user progress and completions
    if (userId) {
      // Fetch user quest progress
      const { data: userProgress } = await supabase
        .from("user_quest_progress")
        .select("*")
        .eq("user_id", userId)
        .eq("quest_id", id)
        .single();

      progress = userProgress;

      // Fetch user task completions
      const { data: userCompletions } = await supabase
        .from("user_task_completions")
        .select("*")
        .eq("user_id", userId)
        .eq("quest_id", id);

      completions = userCompletions || [];
    }

    res.status(200).json({
      quest,
      progress,
      completions,
    });
  } catch (error) {
    log.error("Error in quest details API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
