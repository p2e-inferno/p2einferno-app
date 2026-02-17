import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getPrivyUser } from "@/lib/auth/privy";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";
import { sortQuestTasks } from "@/lib/quests/sort-tasks";

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
      .order("created_at", { ascending: true });

    if (error) {
      log.error("Error fetching quests:", error);
      return res.status(500).json({
        error: "Failed to fetch quests",
        details: error.message,
        code: error.code,
      });
    }

    // Pre-fetch user face verification to avoid N+1 queries in the loop
    let userFaceVerified = null;
    if (userId && (quests || []).some((q: any) => q.requires_gooddollar_verification)) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_face_verified, face_verification_expiry")
        .eq("privy_user_id", userId)
        .maybeSingle();

      const now = new Date();
      userFaceVerified =
        profile?.is_face_verified &&
        (!profile?.face_verification_expiry ||
          new Date(profile.face_verification_expiry) > now);
    }

    const questsWithPrereqs = await Promise.all(
      (quests || []).map(async (quest: any) => {
        if (!userId) {
          return sortQuestTasks(quest);
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
            requires_gooddollar_verification:
              quest.requires_gooddollar_verification ?? false,
            userFaceVerified,
          },
        );

        return {
          ...sortQuestTasks(quest),
          can_start: prereqCheck.canProceed,
          prerequisite_state:
            prereqCheck.prerequisiteState ??
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
