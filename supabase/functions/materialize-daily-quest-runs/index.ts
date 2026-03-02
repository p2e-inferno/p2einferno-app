// Scheduled Edge Function: materialize daily quest runs once per UTC day.
//
// This function is intended to be invoked by Supabase Scheduler (cron) at/after 00:00 UTC.
// It is idempotent: uniqueness constraints + ignoreDuplicates prevent duplicate runs/tasks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const log = {
  info: (...args: unknown[]) =>
    console.log("[materialize-daily-quest-runs]", ...args),
  warn: (...args: unknown[]) =>
    console.warn("[materialize-daily-quest-runs]", ...args),
  error: (...args: unknown[]) =>
    console.error("[materialize-daily-quest-runs]", ...args),
};

function getTodayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

type TemplateRow = { id: string; title: string };
type DailyQuestRunRow = { id: string };
type DailyQuestTaskRow = {
  id: string;
  title: string;
  description: string;
  task_type: string;
  verification_method: string | null;
  reward_amount: number | null;
  order_index: number;
  task_config: Record<string, unknown> | null;
  input_required: boolean | null;
  input_label: string | null;
  input_placeholder: string | null;
  input_validation: string | null;
  requires_admin_review: boolean | null;
};

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  if (!("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cronSecret = Deno.env.get("MATERIALIZE_DAILY_QUEST_RUNS_SECRET");
  if (!cronSecret) {
    log.error("Missing MATERIALIZE_DAILY_QUEST_RUNS_SECRET env var");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const providedSecret = req.headers.get("x-cron-secret");
  if (!providedSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("NEXT_SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    log.error("Missing env vars", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const todayUtc = getTodayUtc();
  const startsAt = `${todayUtc}T00:00:00Z`;
  const endsAt = `${todayUtc}T23:59:59.999Z`;

  const { data: templates, error: templateError } = await supabaseAdmin
    .from<TemplateRow>("daily_quest_templates")
    .select("id,title")
    .eq("is_active", true);

  if (templateError) {
    log.error("daily templates fetch failed", { templateError });
    return new Response(
      JSON.stringify({ error: "Failed to fetch templates" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const templateRows = Array.isArray(templates) ? templates : [];
  let processed = 0;

  for (const tmpl of templateRows) {
    const templateId = tmpl.id;
    const templateTitle = tmpl.title;

    const { error: upsertError } = await supabaseAdmin
      .from("daily_quest_runs")
      .upsert(
        {
          daily_quest_template_id: templateId,
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
      log.warn("daily run upsert failed", { templateId, upsertError });
      continue;
    }

    const { data: runRow, error: runError } = await supabaseAdmin
      .from<DailyQuestRunRow>("daily_quest_runs")
      .select("id")
      .eq("daily_quest_template_id", templateId)
      .eq("run_date", todayUtc)
      .maybeSingle();

    if (runError || !runRow) {
      log.warn("daily run fetch failed", { templateId, runError });
      continue;
    }

    const runId = runRow.id;

    const { data: tasks, error: taskError } = await supabaseAdmin
      .from<DailyQuestTaskRow>("daily_quest_tasks")
      .select(
        "id,title,description,task_type,verification_method,reward_amount,order_index,task_config,input_required,input_label,input_placeholder,input_validation,requires_admin_review",
      )
      .eq("daily_quest_template_id", templateId)
      .order("order_index");

    if (taskError) {
      log.warn("daily template tasks fetch failed", { templateId, taskError });
      continue;
    }

    const taskRows: DailyQuestTaskRow[] = Array.isArray(tasks) ? tasks : [];
    if (taskRows.length > 0) {
      const { error: snapshotError } = await supabaseAdmin
        .from("daily_quest_run_tasks")
        .upsert(
          taskRows.map((t) => ({
            daily_quest_run_id: runId,
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
          {
            onConflict: "daily_quest_run_id,order_index",
            ignoreDuplicates: true,
          },
        );

      if (snapshotError) {
        log.warn("daily run task snapshot failed", {
          templateId,
          runId,
          snapshotError,
        });
        continue;
      }
    }

    const { error: dedupeErr } = await supabaseAdmin
      .from("daily_quest_notifications")
      .insert({
        daily_quest_template_id: templateId,
        run_date: todayUtc,
        notification_type: "daily_quest_refresh",
      });

    const dedupeCode = getErrorCode(dedupeErr);
    if (dedupeErr && dedupeCode !== "23505") {
      log.warn("daily quest refresh dedupe insert failed", {
        templateId,
        todayUtc,
        templateTitle,
        dedupeErr,
      });
    }

    processed += 1;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      todayUtc,
      templates: templateRows.length,
      processed,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
