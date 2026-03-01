import type { SupabaseClient } from "@supabase/supabase-js";
import { broadcastTelegramNotification } from "@/lib/notifications/telegram";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:daily-runs");

export async function ensureRefreshNotificationSent(
  supabase: SupabaseClient,
  templateId: string,
  runDateUtc: string,
  templateTitle: string,
) {
  // 1. Insert dedupe row
  const { data: dedupeRow, error } = await supabase
    .from("daily_quest_notifications")
    .insert({
      daily_quest_template_id: templateId,
      run_date: runDateUtc,
      notification_type: "daily_quest_refresh",
    })
    .select("id")
    .maybeSingle();

  if (error && error.code !== "23505") {
    // Ignore unique_violation
    log.warn("daily quest refresh dedupe insert failed", {
      templateId,
      runDateUtc,
      error,
    });
  }

  // 2. Only broadcast if we successfully inserted the dedupe row
  if (dedupeRow) {
    // Fire-and-forget to avoid blocking read endpoints (broadcast can take minutes on large user bases).
    broadcastTelegramNotification(
      supabase,
      "Daily quest refreshed",
      `"${templateTitle}" is now available for today.`,
      "/lobby/quests",
      "daily_quest_refresh",
    ).catch((e) =>
      log.warn("daily quest refresh broadcast failed", {
        templateId,
        runDateUtc,
        error: e,
      }),
    );
  }
}

export async function ensureTodayDailyRuns(supabase: SupabaseClient) {
  const todayUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const startsAt = `${todayUtc}T00:00:00Z`;
  const endsAt = `${todayUtc}T23:59:59.999Z`;

  // 1) Fetch active templates (runs are created idempotently below).
  const { data: templates, error: templateError } = await supabase
    .from("daily_quest_templates")
    .select("id, title")
    .eq("is_active", true);

  if (templateError) {
    log.warn("daily templates fetch failed", { templateError });
    return;
  }
  if (!templates?.length) return;

  for (const tmpl of templates) {
    // 2) Upsert run row; on conflict do nothing.
    const { error: upsertError } = await supabase.from("daily_quest_runs").upsert(
      {
        daily_quest_template_id: tmpl.id,
        run_date: todayUtc,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "active",
      },
      {
        onConflict: "daily_quest_template_id,run_date",
        ignoreDuplicates: true,
      },
    );

    if (upsertError) {
      log.warn("daily run upsert failed", { templateId: tmpl.id, upsertError });
      continue;
    }

    // Always fetch the run record to get the ID (upsert with ignoreDuplicates returns no row on conflict).
    const { data: runRow, error: runError } = await supabase
      .from("daily_quest_runs")
      .select("id")
      .eq("daily_quest_template_id", tmpl.id)
      .eq("run_date", todayUtc)
      .maybeSingle();

    if (runError || !runRow) {
      log.warn("daily run fetch failed", { templateId: tmpl.id, runError });
      continue;
    }

    // 3) Snapshot template tasks into run tasks idempotently:
    //    - Allows concurrent callers safely (unique(daily_quest_run_id, order_index))
    //    - Backfills if a previous request created the run row but failed before snapshotting tasks
    const { data: tasks, error: taskError } = await supabase
      .from("daily_quest_tasks")
      .select("*")
      .eq("daily_quest_template_id", tmpl.id)
      .order("order_index");

    if (taskError) {
      log.warn("daily template tasks fetch failed", {
        templateId: tmpl.id,
        taskError,
      });
      continue;
    }
    if (tasks?.length) {
      const { error: snapshotError } = await supabase
        .from("daily_quest_run_tasks")
        .upsert(
          tasks.map((t: any) => ({
            daily_quest_run_id: runRow.id,
            daily_quest_template_task_id: t.id,
            title: t.title,
            description: t.description,
            task_type: t.task_type,
            verification_method: t.verification_method,
            reward_amount: t.reward_amount,
            order_index: t.order_index,
            // daily_quest_run_tasks.task_config is NOT NULL; template tasks may be null.
            task_config: t.task_config ?? {},
            input_required: t.input_required,
            input_label: t.input_label,
            input_placeholder: t.input_placeholder,
            input_validation: t.input_validation,
            requires_admin_review: t.requires_admin_review,
          })),
          { onConflict: "daily_quest_run_id,order_index", ignoreDuplicates: true },
        );
      if (snapshotError) {
        log.warn("daily run task snapshot failed", {
          templateId: tmpl.id,
          runId: runRow.id,
          snapshotError,
        });
        continue;
      }
    }

    // 4) Send refresh notification (once per template per day).
    await ensureRefreshNotificationSent(supabase, tmpl.id, todayUtc, tmpl.title);
  }
}

