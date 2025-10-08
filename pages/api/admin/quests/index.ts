import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

import type { QuestTask, Quest } from "@/lib/supabase/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:quests:index");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const supabase = createAdminClient();

    switch (req.method) {
      case "GET":
        return await getQuests(res, supabase);
      case "POST":
        return await createQuest(req, res, supabase);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    log.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

// Wrap the handler with admin authentication middleware
export default withAdminAuth(handler);

async function getQuests(res: NextApiResponse, supabase: any) {
  try {
    // Fetch quests
    const { data: questsData, error: questsError } = await supabase
      .from("quests")
      .select("*, quest_tasks(*)")
      .order("created_at", { ascending: false });

    if (questsError) throw questsError;

    // Fetch quest statistics
    const { data: statsData, error: statsError } = await supabase
      .from("quest_statistics")
      .select("*");

    if (statsError) throw statsError;

    // Combine quests with their statistics
    const questsWithStats = (questsData || []).map((quest: Quest) => {
      const stats = statsData?.find((s: any) => s.quest_id === quest.id);
      return {
        ...quest,
        stats: stats
          ? {
              total_users: stats.total_users || 0,
              completed_users: stats.completed_users || 0,
              pending_submissions: stats.pending_submissions || 0,
              completion_rate: stats.completion_rate || 0,
            }
          : undefined,
      };
    });

    return res.status(200).json({
      success: true,
      data: questsWithStats,
    });
  } catch (error: any) {
    log.error("Error fetching quests:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch quests",
    });
  }
}

async function createQuest(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
) {
  const {
    title,
    description,
    image_url,
    tasks,
    xp_reward,
    is_active,
    lock_address,
    lock_manager_granted,
    grant_failure_reason,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  // Start a transaction
  try {
    // 1. Insert the quest
    // Harden grant flags for quests: if lock provided and flag not provided, default to false; clear reason when granted
    const grantGrantedFinal =
      typeof lock_manager_granted === 'boolean'
        ? lock_manager_granted
        : lock_address
        ? false
        : false;
    const grantReasonFinal = grantGrantedFinal ? null : grant_failure_reason || null;

    const { data: quest, error: questError } = await supabase
      .from("quests")
      .insert({
        title,
        description,
        image_url,
        total_reward: xp_reward || 0,
        is_active,
        lock_address,
        lock_manager_granted: grantGrantedFinal,
        grant_failure_reason: grantReasonFinal,
      })
      .select()
      .single();

    if (questError) throw questError;

    // 2. If tasks are provided, insert them
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      const questTasks = tasks.map(
        (task: Partial<QuestTask>, index: number) => ({
          quest_id: quest.id,
          title: task.title,
          description: task.description,
          task_type: task.task_type,
          verification_method: task.verification_method,
          reward_amount: task.reward_amount || 0,
          order_index: task.order_index ?? index,
          // Optional fields if provided
          input_required: task.input_required,
          input_label: task.input_label,
          input_placeholder: task.input_placeholder,
          input_validation: task.input_validation,
          requires_admin_review: task.requires_admin_review,
        }),
      );

      const { error: tasksError } = await supabase
        .from("quest_tasks")
        .insert(questTasks);

      if (tasksError) throw tasksError;
    }

    // 3. Return the created quest with its tasks
    const { data: fullQuest, error: fetchError } = await supabase
      .from("quests")
      .select("*, quest_tasks(*)")
      .eq("id", quest.id)
      .single();

    if (fetchError) throw fetchError;

    return res.status(201).json(fullQuest);
  } catch (error: any) {
    log.error("Error creating quest:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to create quest" });
  }
}
