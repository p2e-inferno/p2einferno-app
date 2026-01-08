import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getPrivyUser } from "@/lib/auth/privy";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";

const log = getLogger("api:quests:index");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const authUser = await getPrivyUser(req);
    const userId = authUser?.id || null;
    const userWallet = userId
      ? await getUserPrimaryWallet(supabase, userId)
      : null;

    const { data: quests, error } = await supabase
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
          created_at,
          task_config,
          input_required,
          input_label,
          input_placeholder,
          input_validation,
          requires_admin_review
        )
      `,
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("Error fetching quests:", error);
      return res.status(500).json({
        error: "Failed to fetch quests",
        details: error.message,
        code: error.code,
      });
    }

    const questsWithPrereqs = await Promise.all(
      (quests || []).map(async (quest: any) => {
        if (!userId) {
          return quest;
        }

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

        return {
          ...quest,
          can_start: prereqCheck.canProceed,
          prerequisite_state:
            prereqCheck.prerequisiteState ||
            (quest.prerequisite_quest_id ||
            quest.prerequisite_quest_lock_address
              ? "missing_completion"
              : "none"),
        };
      }),
    );

    res.status(200).json({ quests: questsWithPrereqs });
  } catch (error) {
    log.error("Error in quests API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
