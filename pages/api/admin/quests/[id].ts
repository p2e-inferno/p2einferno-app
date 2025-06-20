import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { nanoid } from "nanoid";
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

    const { id } = req.query;
    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "Quest ID is required" });
    }

    const supabase = createAdminClient();

    switch (req.method) {
      case "GET":
        return await getQuest(req, res, supabase, id);
      case "PUT":
        return await updateQuest(req, res, supabase, id);
      case "DELETE":
        return await deleteQuest(req, res, supabase, id);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("API error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

async function getQuest(_req: NextApiRequest, res: NextApiResponse, supabase: any, questId: string) {
  try {
    // Fetch quest with tasks
    const { data: quest, error } = await supabase
      .from("quests")
      .select(`
        *,
        quest_tasks (*)
      `)
      .eq("id", questId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Quest not found" });
      }
      throw error;
    }

    // Fetch quest statistics
    const { data: stats } = await supabase
      .from("quest_statistics")
      .select("*")
      .eq("quest_id", questId)
      .single();

    // Fetch pending submissions if any
    const { data: submissions } = await supabase
      .from("user_task_completions")
      .select(`
        *,
        task:quest_tasks!user_task_completions_task_id_fkey (
          id,
          title,
          task_type
        ),
        profiles!user_task_completions_user_id_fkey (
          id,
          email,
          wallet_address,
          display_name
        )
      `)
      .eq("quest_id", questId)
      .eq("submission_status", "pending")
      .order("completed_at", { ascending: false });

    return res.status(200).json({ 
      quest: {
        ...quest,
        stats: stats || null,
        pending_submissions: submissions || []
      }
    });
  } catch (error: any) {
    console.error("Error fetching quest:", error);
    return res.status(500).json({ error: "Failed to fetch quest" });
  }
}

async function updateQuest(req: NextApiRequest, res: NextApiResponse, supabase: any, questId: string) {
  const { quest, tasks } = req.body;

  if (!quest) {
    return res.status(400).json({ error: "Quest data is required" });
  }

  try {
    const now = new Date().toISOString();

    // Update quest
    const { data: questData, error: questError } = await supabase
      .from("quests")
      .update({
        ...quest,
        updated_at: now,
      })
      .eq("id", questId)
      .select()
      .single();

    if (questError) throw questError;

    // Handle tasks update if provided
    if (tasks && Array.isArray(tasks)) {
      // Delete existing tasks
      const { error: deleteError } = await supabase
        .from("quest_tasks")
        .delete()
        .eq("quest_id", questId);

      if (deleteError) throw deleteError;

      // Insert new/updated tasks
      if (tasks.length > 0) {
        const tasksWithIds = tasks.map((task: Partial<QuestTask>, index: number) => {
          // Keep existing ID if it's an update, generate new if it's new
          const taskId = task.id && !task.id.startsWith("temp") ? task.id : nanoid(10);
          return {
            id: taskId,
            quest_id: questId,
            ...task,
            order_index: task.order_index ?? index,
            created_at: task.created_at || now,
            updated_at: now,
          };
        });

        const { data: tasksData, error: tasksError } = await supabase
          .from("quest_tasks")
          .insert(tasksWithIds)
          .select();

        if (tasksError) throw tasksError;

        return res.status(200).json({ 
          success: true, 
          quest: {
            ...questData,
            quest_tasks: tasksData,
          }
        });
      }
    }

    return res.status(200).json({ 
      success: true, 
      quest: questData 
    });
  } catch (error: any) {
    console.error("Error updating quest:", error);
    return res.status(500).json({ error: "Failed to update quest" });
  }
}

async function deleteQuest(_req: NextApiRequest, res: NextApiResponse, supabase: any, questId: string) {
  try {
    // Check if quest has any completions
    const { count } = await supabase
      .from("user_quest_progress")
      .select("*", { count: "exact", head: true })
      .eq("quest_id", questId);

    if (count > 0) {
      return res.status(400).json({ 
        error: "Cannot delete quest with user progress. Deactivate it instead." 
      });
    }

    // Delete quest (tasks will be cascade deleted)
    const { error } = await supabase
      .from("quests")
      .delete()
      .eq("id", questId);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error deleting quest:", error);
    return res.status(500).json({ error: "Failed to delete quest" });
  }
}