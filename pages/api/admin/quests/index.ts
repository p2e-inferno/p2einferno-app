import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { randomUUID } from "crypto";
import type { QuestTask } from "@/lib/supabase/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TODO: Add proper admin role check
    // For now, we'll allow all authenticated users (update this in production)

    const supabase = createAdminClient();

    switch (req.method) {
      case "GET":
        return await getQuests(req, res, supabase);
      case "POST":
        return await createQuest(req, res, supabase);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

async function getQuests(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  try {
    const { data: quests, error } = await supabase
      .from("quests")
      .select(
        `
        *,
        quest_tasks (
          id,
          title,
          description,
          task_type,
          reward_amount,
          order_index,
          input_required,
          requires_admin_review
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch quest statistics
    const { data: stats, error: statsError } = await supabase
      .from("quest_statistics")
      .select("*");

    if (statsError) {
      console.error("Error fetching quest statistics:", statsError);
    }

    // Combine quests with stats
    const questsWithStats = (quests || []).map((quest: any) => {
      const questStats = stats?.find((s: any) => s.quest_id === quest.id);
      return {
        ...quest,
        stats: questStats || null,
      };
    });

    return res.status(200).json({ quests: questsWithStats });
  } catch (error: any) {
    console.error("Error fetching quests:", error);
    return res.status(500).json({ error: "Failed to fetch quests" });
  }
}

async function createQuest(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { quest, tasks } = req.body;

  if (!quest || !quest.title || !quest.description) {
    return res
      .status(400)
      .json({ error: "Quest title and description are required" });
  }

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: "At least one task is required" });
  }

  try {
    // Start a transaction
    const questId = randomUUID();
    const now = new Date().toISOString();

    // Create the quest
    const { data: questData, error: questError } = await supabase
      .from("quests")
      .insert({
        id: questId,
        ...quest,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (questError) throw questError;

    // Create tasks with proper IDs and timestamps
    const tasksWithIds = tasks.map(
      (task: Partial<QuestTask>, index: number) => ({
        id: randomUUID(),
        quest_id: questId,
        ...task,
        order_index: task.order_index ?? index,
        created_at: now,
        updated_at: now,
      })
    );

    const { data: tasksData, error: tasksError } = await supabase
      .from("quest_tasks")
      .insert(tasksWithIds)
      .select();

    if (tasksError) {
      // Rollback quest creation if tasks fail
      await supabase.from("quests").delete().eq("id", questId);
      throw tasksError;
    }

    // Return the created quest with tasks
    const createdQuest = {
      ...questData,
      quest_tasks: tasksData,
    };

    return res.status(201).json({
      success: true,
      quest: createdQuest,
    });
  } catch (error: any) {
    console.error("Error creating quest:", error);
    return res.status(500).json({ error: "Failed to create quest" });
  }
}
