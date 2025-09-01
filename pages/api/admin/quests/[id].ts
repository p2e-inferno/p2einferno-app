import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import type { QuestTask } from "@/lib/supabase/types";
import { randomUUID } from "crypto";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
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
      case "PATCH":
        return await patchQuest(req, res, supabase, id);
      case "DELETE":
        return await deleteQuest(req, res, supabase, id);
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

async function getQuest(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string
) {
  try {
    // Fetch quest with tasks
    const { data: quest, error } = await supabase
      .from("quests")
      .select(
        `
        *,
        quest_tasks (*)
      `
      )
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
      .select(
        `
        *,
        task:quest_tasks!user_task_completions_task_id_fkey (
          id,
          title,
          task_type
        ),
        user_profiles!user_task_completions_user_id_fkey (
          id,
          email,
          wallet_address,
          display_name,
          privy_user_id
        )
      `
      )
      .eq("quest_id", questId)
      .eq("submission_status", "pending")
      .order("completed_at", { ascending: false });

    return res.status(200).json({
      quest: {
        ...quest,
        stats: stats || null,
        pending_submissions: submissions || [],
      },
    });
  } catch (error: any) {
    console.error("Error fetching quest:", error);
    return res.status(500).json({ error: "Failed to fetch quest" });
  }
}

async function updateQuest(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string
) {
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
        const tasksWithIds = tasks.map(
          (task: Partial<QuestTask>, index: number) => {
            // Separate the id field so we can handle it explicitly
            const { id: incomingId, ...taskData } =
              task as Partial<QuestTask> & {
                id?: string | null;
              };

            const base: Partial<QuestTask> & { quest_id: string } = {
              quest_id: questId,
              ...taskData,
              order_index: task.order_index ?? index,
              created_at: task.created_at || now,
              updated_at: now,
            } as any;

            if (incomingId && !incomingId.startsWith("temp")) {
              // Existing task with a real UUID, keep it
              (base as any).id = incomingId;
            } else {
              // New task – generate a fresh UUID so we don't violate the NOT NULL constraint
              (base as any).id = randomUUID();
            }

            return base;
          }
        );

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
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      quest: questData,
    });
  } catch (error: any) {
    console.error("Error updating quest:", error);
    return res.status(500).json({ error: "Failed to update quest" });
  }
}

async function patchQuest(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string
) {
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: "Update data is required" });
  }

  try {
    const now = new Date().toISOString();

    // Update quest with only the provided fields
    const { data: questData, error: questError } = await supabase
      .from("quests")
      .update({
        ...updates,
        updated_at: now,
      })
      .eq("id", questId)
      .select()
      .single();

    if (questError) throw questError;

    return res.status(200).json({
      success: true,
      data: questData,
    });
  } catch (error: any) {
    console.error("Error patching quest:", error);
    return res.status(500).json({ error: "Failed to update quest" });
  }
}

async function deleteQuest(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string
) {
  try {
    // Check if quest has any completions
    const { count } = await supabase
      .from("user_quest_progress")
      .select("*", { count: "exact", head: true })
      .eq("quest_id", questId);

    if (count > 0) {
      return res.status(400).json({
        error: "Cannot delete quest with user progress. Deactivate it instead.",
      });
    }

    // Delete quest (tasks will be cascade deleted)
    const { error } = await supabase.from("quests").delete().eq("id", questId);

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error deleting quest:", error);
    return res.status(500).json({ error: "Failed to delete quest" });
  }
}

export default withAdminAuth(handler);
