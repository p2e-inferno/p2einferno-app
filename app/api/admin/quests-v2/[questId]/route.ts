import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { getLogger } from "@/lib/utils/logger";
import { ADMIN_CACHE_TAGS } from "@/lib/app-config/admin";
import { validateVendorTaskConfig } from "@/lib/quests/vendor-task-config";
import { sortQuestTasks } from "@/lib/quests/sort-tasks";

const log = getLogger("api:quests:[questId]");

function invalidateQuestCache(id: string) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.quest(String(id)), "max");
    revalidateTag(ADMIN_CACHE_TAGS.questList, "max");
  } catch (error) {
    log.warn("quest cache revalidation failed", { error, id });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const { questId } = await params;
  const supabase = createAdminClient();
  try {
    const { data: quest, error } = await supabase
      .from("quests")
      .select("*, quest_tasks(*)")
      .eq("id", questId)
      .single();
    if (error) {
      if ((error as any).code === "PGRST116") {
        return NextResponse.json({ error: "Quest not found" }, { status: 404 });
      }
      throw error;
    }

    const { data: stats } = await supabase
      .from("quest_statistics")
      .select("*")
      .eq("quest_id", questId)
      .single();

    const { data: submissions } = await supabase
      .from("user_task_completions")
      .select(
        `
        *,
        task:quest_tasks!user_task_completions_task_id_fkey ( id, title, task_type ),
        user_profiles!user_task_completions_user_id_fkey ( id, email, wallet_address, display_name, privy_user_id )
      `,
      )
      .eq("quest_id", questId)
      .eq("submission_status", "pending")
      .order("completed_at", { ascending: false });

    const full = {
      ...sortQuestTasks(quest as any),
      stats: stats || null,
      pending_submissions: submissions || [],
    };
    return NextResponse.json(
      { success: true, data: full, quest: full },
      { status: 200 },
    );
  } catch (error: any) {
    log.error("quest GET error", { error, questId });
    return NextResponse.json(
      { error: "Failed to fetch quest" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const { questId } = await params;
  const supabase = createAdminClient();
  try {
    const body = await req.json();
    const { tasks, xp_reward, ...questFields } = body || {};

    // Safety net: normalize empty strings for constrained columns.
    // Some form controls serialize "no selection" as "" but the DB expects NULL.
    if (questFields?.prerequisite_quest_id === "")
      questFields.prerequisite_quest_id = null;
    if (questFields?.activation_type === "") questFields.activation_type = null;

    log.info("quest PUT received", {
      questId,
      fields: {
        reward_type: questFields?.reward_type ?? null,
        activation_type: questFields?.activation_type ?? null,
        prerequisite_quest_id: questFields?.prerequisite_quest_id ?? null,
        prerequisite_quest_lock_address:
          questFields?.prerequisite_quest_lock_address ?? null,
        requires_prerequisite_key:
          questFields?.requires_prerequisite_key ?? null,
      },
      meta: {
        tasksCount: Array.isArray(tasks) ? tasks.length : null,
        hasXpReward: typeof xp_reward !== "undefined",
      },
    });

    // Harden grant flags
    if (questFields?.lock_address) {
      if (
        typeof questFields.lock_manager_granted === "undefined" ||
        questFields.lock_manager_granted === null
      ) {
        questFields.lock_manager_granted = false;
      }
      if (questFields.lock_manager_granted === true) {
        questFields.grant_failure_reason = null;
      }

      // Harden security flags - ONLY if they are explicitly provided in the update
      if (
        Object.prototype.hasOwnProperty.call(questFields, "max_keys_secured")
      ) {
        if (questFields.max_keys_secured === null) {
          questFields.max_keys_secured = false;
        }
        if (questFields.max_keys_secured === true) {
          questFields.max_keys_failure_reason = null;
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(
          questFields,
          "transferability_secured",
        )
      ) {
        if (questFields.transferability_secured === null) {
          questFields.transferability_secured = false;
        }
        if (questFields.transferability_secured === true) {
          questFields.transferability_failure_reason = null;
        }
      }
    }

    const now = new Date().toISOString();
    const updateData: any = { ...questFields, updated_at: now };
    if (typeof xp_reward !== "undefined") updateData.total_reward = xp_reward;

    log.info("quest PUT update payload", {
      questId,
      updateData: {
        reward_type: updateData?.reward_type ?? null,
        activation_type: updateData?.activation_type ?? null,
        prerequisite_quest_id: updateData?.prerequisite_quest_id ?? null,
        prerequisite_quest_lock_address:
          updateData?.prerequisite_quest_lock_address ?? null,
        requires_prerequisite_key:
          updateData?.requires_prerequisite_key ?? null,
        total_reward: updateData?.total_reward ?? null,
        lock_address: updateData?.lock_address ?? null,
      },
    });

    const { error: questError } = await supabase
      .from("quests")
      .update(updateData)
      .eq("id", questId)
      .select("*")
      .single();
    if (questError) throw questError;

    // Tasks update
    if (Array.isArray(tasks)) {
      const validation = await validateVendorTaskConfig(tasks);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      const { data: existingTasks } = await supabase
        .from("quest_tasks")
        .select("id")
        .eq("quest_id", questId);
      const existingIds = (existingTasks || []).map((t: any) => t.id);
      const incomingIds = tasks
        .filter((t: any) => t.id && !String(t.id).startsWith("temp"))
        .map((t: any) => t.id);

      const toDelete = existingIds.filter(
        (id: string) => !incomingIds.includes(id),
      );
      if (toDelete.length > 0) {
        const { count, error: countError } = await supabase
          .from("user_task_completions")
          .select("*", { count: "exact", head: true })
          .in("task_id", toDelete);
        if (countError) throw countError;
        if (count && count > 0) {
          return NextResponse.json(
            {
              error: `Cannot delete ${toDelete.length} task(s) with user submissions (${count} submission(s) exist). Deactivate the quest instead or keep existing tasks.`,
            },
            { status: 400 },
          );
        }
      }

      const toInsert = tasks.filter(
        (t: any) => !t.id || String(t.id).startsWith("temp"),
      );
      const toUpdate = tasks.filter(
        (t: any) => t.id && !String(t.id).startsWith("temp"),
      );

      for (const task of toUpdate) {
        const { id, ...taskData } = task;
        const { error: uErr } = await supabase
          .from("quest_tasks")
          .update({ ...taskData, quest_id: questId, updated_at: now })
          .eq("id", id);
        if (uErr) throw uErr;
      }

      if (toInsert.length > 0) {
        const newTasks = toInsert.map((task: any, index: number) => {
          const { id: _temp, ...rest } = task;
          return {
            quest_id: questId,
            ...rest,
            task_config: task.task_config || {},
            order_index: task.order_index ?? toUpdate.length + index,
            created_at: now,
            updated_at: now,
          };
        });
        const { error: iErr } = await supabase
          .from("quest_tasks")
          .insert(newTasks);
        if (iErr) throw iErr;
      }

      if (toDelete.length > 0) {
        const { error: dErr } = await supabase
          .from("quest_tasks")
          .delete()
          .in("id", toDelete);
        if (dErr) throw dErr;
      }
    }

    const { data: updatedQuest, error: finalErr } = await supabase
      .from("quests")
      .select("*, quest_tasks(*)")
      .eq("id", questId)
      .single();
    if (finalErr) throw finalErr;

    invalidateQuestCache(questId);
    const sortedQuest = sortQuestTasks(updatedQuest as any);
    return NextResponse.json(
      { success: true, data: sortedQuest, quest: sortedQuest },
      { status: 200 },
    );
  } catch (error: any) {
    log.error("quest PUT error", { error, questId });
    return NextResponse.json(
      { error: "Failed to update quest" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const { questId } = await params;
  const supabase = createAdminClient();
  try {
    const updates: any = await req.json();
    const now = new Date().toISOString();

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

    const { data, error } = await supabase
      .from("quests")
      .update({ ...updates, updated_at: now })
      .eq("id", questId)
      .select("*")
      .single();
    if (error) throw error;

    invalidateQuestCache(questId);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error("quest PATCH error", { error, questId });
    return NextResponse.json(
      { error: "Failed to update quest" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ questId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const { questId } = await params;
  const supabase = createAdminClient();
  try {
    const { count } = await supabase
      .from("user_quest_progress")
      .select("*", { count: "exact", head: true })
      .eq("quest_id", questId);
    if (count && count > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete quest with user progress. Deactivate it instead.",
        },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("quests").delete().eq("id", questId);
    if (error) throw error;

    invalidateQuestCache(questId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    log.error("quest DELETE error", { error, questId });
    return NextResponse.json(
      { error: "Failed to delete quest" },
      { status: 500 },
    );
  }
}
