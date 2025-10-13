import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import type { QuestTask } from "@/lib/supabase/types";
import { randomUUID } from "crypto";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:quests:[id]");

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    log.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

async function getQuest(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string,
) {
  try {
    // Fetch quest with tasks
    const { data: quest, error } = await supabase
      .from("quests")
      .select(
        `
        *,
        quest_tasks (*)
      `,
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
      `,
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
    log.error("Error fetching quest:", error);
    return res.status(500).json({ error: "Failed to fetch quest" });
  }
}

async function updateQuest(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string,
) {
  // Accept flat structure to match POST endpoint
  const { tasks, xp_reward, ...questFields } = req.body;

  // Log request body for debugging (temporary)
  log.debug("Update quest request body", {
    questId,
    hasTasksField: !!tasks,
    tasksCount: Array.isArray(tasks) ? tasks.length : 0,
    hasXpReward: xp_reward !== undefined,
    questFields: Object.keys(questFields),
  });

  if (!questFields || Object.keys(questFields).length === 0) {
    return res.status(400).json({ error: "Quest data is required" });
  }

  try {
    const now = new Date().toISOString();

    // Harden grant flags when lock_address present
    const lockAddr = (questFields as any)?.lock_address;
    if (lockAddr) {
      const hasGranted = Object.prototype.hasOwnProperty.call(
        questFields,
        "lock_manager_granted",
      );
      if (
        !hasGranted ||
        (questFields as any).lock_manager_granted === undefined ||
        (questFields as any).lock_manager_granted === null
      ) {
        (questFields as any).lock_manager_granted = false;
      }
      if ((questFields as any).lock_manager_granted === true) {
        (questFields as any).grant_failure_reason = null;
      }
    }

    // Prepare update data - map xp_reward to total_reward if provided
    const updateData: any = {
      ...questFields,
      updated_at: now,
    };

    // Map xp_reward to total_reward (for compatibility with frontend)
    if (xp_reward !== undefined) {
      updateData.total_reward = xp_reward;
    }

    // Update quest
    const { data: questData, error: questError } = await supabase
      .from("quests")
      .update(updateData)
      .eq("id", questId)
      .select()
      .single();

    if (questError) throw questError;

    // Handle tasks update if provided
    if (tasks && Array.isArray(tasks)) {
      // Step 1: Get existing tasks from database
      const { data: existingTasks, error: fetchError } = await supabase
        .from("quest_tasks")
        .select("id")
        .eq("quest_id", questId);

      if (fetchError) throw fetchError;

      const existingTaskIds = (existingTasks || []).map((t: any) => t.id);
      const incomingTaskIds = tasks
        .filter((t) => t.id && !t.id.startsWith("temp"))
        .map((t) => t.id);

      // Step 2: Identify tasks to delete
      const tasksToDelete = existingTaskIds.filter(
        (id: string) => !incomingTaskIds.includes(id),
      );

      // Step 3: Check if tasks being deleted have user submissions
      if (tasksToDelete.length > 0) {
        const { count, error: countError } = await supabase
          .from("user_task_completions")
          .select("*", { count: "exact", head: true })
          .in("task_id", tasksToDelete);

        if (countError) throw countError;

        if (count && count > 0) {
          return res.status(400).json({
            error: `Cannot delete ${tasksToDelete.length} task(s) with user submissions (${count} submission(s) exist). Deactivate the quest instead or keep existing tasks.`,
          });
        }
      }

      // Step 4: Categorize tasks into insert, update, delete
      const tasksToInsert = tasks.filter(
        (t: Partial<QuestTask>) => !t.id || t.id.startsWith("temp"),
      );
      const tasksToUpdate = tasks.filter(
        (t: Partial<QuestTask>) => t.id && !t.id.startsWith("temp"),
      );

      // Step 5: Execute updates
      for (let i = 0; i < tasksToUpdate.length; i++) {
        const task = tasksToUpdate[i];
        const { id, ...taskData } = task as Partial<QuestTask> & { id: string };

        const { error: updateError } = await supabase
          .from("quest_tasks")
          .update({
            ...taskData,
            quest_id: questId,
            updated_at: now,
          })
          .eq("id", id);

        if (updateError) throw updateError;
      }

      // Step 6: Execute inserts
      if (tasksToInsert.length > 0) {
        const newTasks = tasksToInsert.map(
          (task: Partial<QuestTask>, index: number) => {
            const { id: _tempId, ...taskData } = task as any;
            return {
              id: randomUUID(),
              quest_id: questId,
              ...taskData,
              order_index: task.order_index ?? tasksToUpdate.length + index,
              created_at: now,
              updated_at: now,
            };
          },
        );

        const { error: insertError } = await supabase
          .from("quest_tasks")
          .insert(newTasks);

        if (insertError) throw insertError;
      }

      // Step 7: Execute deletes (already validated no submissions)
      if (tasksToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("quest_tasks")
          .delete()
          .in("id", tasksToDelete);

        if (deleteError) throw deleteError;
      }

      // Step 8: Fetch updated quest with all tasks
      const { data: updatedQuest, error: finalFetchError } = await supabase
        .from("quests")
        .select("*, quest_tasks(*)")
        .eq("id", questId)
        .single();

      if (finalFetchError) throw finalFetchError;

      return res.status(200).json({
        success: true,
        quest: updatedQuest,
      });
    }

    return res.status(200).json({
      success: true,
      quest: questData,
    });
  } catch (error: any) {
    log.error("Error updating quest:", error);
    return res.status(500).json({ error: "Failed to update quest" });
  }
}

async function patchQuest(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string,
) {
  const updates = req.body as any;

  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Update data is required" });
  }

  try {
    const now = new Date().toISOString();

    // Harden grant flags when lock_address present (PATCH semantics: only if provided)
    if (
      Object.prototype.hasOwnProperty.call(updates, "lock_address") &&
      updates.lock_address
    ) {
      if (
        !Object.prototype.hasOwnProperty.call(
          updates,
          "lock_manager_granted",
        ) ||
        updates.lock_manager_granted === undefined ||
        updates.lock_manager_granted === null
      ) {
        updates.lock_manager_granted = false;
      }
      if (updates.lock_manager_granted === true) {
        updates.grant_failure_reason = null;
      }
    }

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
    log.error("Error patching quest:", error);
    return res.status(500).json({ error: "Failed to update quest" });
  }
}

async function deleteQuest(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
  questId: string,
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
    log.error("Error deleting quest:", error);
    return res.status(500).json({ error: "Failed to delete quest" });
  }
}

export default withAdminAuth(handler);
