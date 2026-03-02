import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { getLogger } from "@/lib/utils/logger";
import { ensureTodayDailyRuns } from "@/lib/quests/daily-quests/runs";
import { validateVendorTaskConfig } from "@/lib/quests/vendor-task-config";
import { broadcastTelegramNotification } from "@/lib/notifications/telegram";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { isAddress } from "viem";
import type {
  DailyQuestRun,
  DailyQuestTask,
  DailyQuestTemplate,
} from "@/lib/supabase/types";

const log = getLogger("api:admin:daily-quests");

type DailyQuestTemplatePayload = {
  title?: string;
  description?: string;
  image_url?: string | null;
  is_active?: boolean;
  completion_bonus_reward_amount?: number;
  lock_address?: string | null;
  lock_manager_granted?: boolean;
  grant_failure_reason?: string | null;
  eligibility_config?: {
    min_vendor_stage?: number;
    requires_gooddollar_verification?: boolean;
    required_lock_address?: string;
    required_erc20?: { token?: string; min_balance?: string };
  };
  daily_quest_tasks?: Array<{
    id?: string;
    title?: string;
    description?: string;
    task_type?: string;
    verification_method?: string;
    reward_amount?: number;
    order_index?: number;
    task_config?: Record<string, unknown> | null;
    input_required?: boolean;
    input_label?: string | null;
    input_placeholder?: string | null;
    input_validation?: string | null;
    requires_admin_review?: boolean;
  }>;
};

function validateOrderIndexes(
  tasks: Array<{ order_index?: number }>,
): string | null {
  const seen = new Set<number>();
  for (const t of tasks) {
    if (typeof t.order_index !== "number" || !Number.isInteger(t.order_index)) {
      return "Task order_index must be an integer";
    }
    if (seen.has(t.order_index)) {
      return "Task order_index must be unique within the template";
    }
    seen.add(t.order_index);
  }
  return null;
}

async function validateEligibilityConfig(
  eligibility: DailyQuestTemplatePayload["eligibility_config"] | undefined,
) {
  if (!eligibility) return { ok: true as const };

  if (
    typeof eligibility.required_lock_address === "string" &&
    eligibility.required_lock_address.trim() &&
    !isAddress(eligibility.required_lock_address.trim())
  ) {
    return { ok: false as const, error: "Invalid required lock address" };
  }

  const token = eligibility.required_erc20?.token?.trim() || "";
  const minBalance = eligibility.required_erc20?.min_balance?.trim() || "";

  if ((token && !minBalance) || (!token && minBalance)) {
    return {
      ok: false as const,
      error: "Required ERC20 token and minimum balance must both be set",
    };
  }

  if (token || minBalance) {
    if (!isAddress(token)) {
      return { ok: false as const, error: "Invalid ERC20 token address" };
    }
    if (!/^[0-9]+(\.[0-9]+)?$/.test(minBalance)) {
      return {
        ok: false as const,
        error: "ERC20 minimum balance must be a human decimal string",
      };
    }
    if (!(Number(minBalance) > 0)) {
      return { ok: false as const, error: "ERC20 minimum balance must be > 0" };
    }

    const publicClient = createPublicClientUnified();
    try {
      const decimals = await publicClient.readContract({
        address: token as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
      });
      const frac = minBalance.includes(".")
        ? minBalance.split(".")[1] || ""
        : "";
      if (frac.length > Number(decimals)) {
        return {
          ok: false as const,
          error: `ERC20 minimum balance has too many decimal places (max ${Number(decimals)})`,
        };
      }
    } catch (error) {
      log.warn("ERC20 decimals read failed during eligibility validation", {
        token,
        error,
      });
      return {
        ok: false as const,
        error: "Unable to validate ERC20 minimum balance decimals",
      };
    }
  }

  return { ok: true as const };
}

function normalizeEligibilityConfig(
  eligibility: DailyQuestTemplatePayload["eligibility_config"] | undefined,
) {
  if (!eligibility) return {};
  const normalized: NonNullable<
    DailyQuestTemplatePayload["eligibility_config"]
  > = { ...eligibility };

  if (typeof normalized.required_lock_address === "string") {
    const trimmed = normalized.required_lock_address.trim();
    if (trimmed) {
      normalized.required_lock_address = trimmed;
    } else {
      delete normalized.required_lock_address;
    }
  }

  if (normalized.required_erc20) {
    const token =
      typeof normalized.required_erc20.token === "string"
        ? normalized.required_erc20.token.trim()
        : "";
    const minBalance =
      typeof normalized.required_erc20.min_balance === "string"
        ? normalized.required_erc20.min_balance.trim()
        : "";

    if (token && minBalance) {
      normalized.required_erc20 = { token, min_balance: minBalance };
    } else {
      delete normalized.required_erc20;
    }
  }

  return normalized;
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const supabase = createAdminClient();

  try {
    await ensureTodayDailyRuns(supabase);

    const todayUtc = new Date().toISOString().slice(0, 10);

    const { data: templates, error: tmplErr } = await supabase
      .from("daily_quest_templates")
      .select("*")
      .order("created_at", { ascending: true });
    if (tmplErr) {
      return NextResponse.json({ error: tmplErr.message }, { status: 400 });
    }

    const typedTemplates = (templates || []) as DailyQuestTemplate[];
    const templateIds = typedTemplates.map((t: DailyQuestTemplate) => t.id);

    const { data: tasks, error: taskErr } = templateIds.length
      ? await supabase
          .from("daily_quest_tasks")
          .select("*")
          .in("daily_quest_template_id", templateIds)
          .order("order_index")
      : { data: [], error: null };
    if (taskErr) {
      return NextResponse.json({ error: taskErr.message }, { status: 400 });
    }

    const { data: runs, error: runErr } = templateIds.length
      ? await supabase
          .from("daily_quest_runs")
          .select(
            "id,daily_quest_template_id,run_date,starts_at,ends_at,status",
          )
          .in("daily_quest_template_id", templateIds)
          .eq("run_date", todayUtc)
      : { data: [], error: null };
    if (runErr) {
      return NextResponse.json({ error: runErr.message }, { status: 400 });
    }

    const typedTasks = (tasks || []) as DailyQuestTask[];
    const tasksByTemplate = new Map<string, DailyQuestTask[]>();
    for (const t of typedTasks) {
      const key = t.daily_quest_template_id;
      if (!tasksByTemplate.has(key)) tasksByTemplate.set(key, []);
      tasksByTemplate.get(key)!.push(t);
    }

    const typedRuns = (runs || []) as DailyQuestRun[];
    const runByTemplate = new Map<string, DailyQuestRun>();
    for (const r of typedRuns) {
      runByTemplate.set(r.daily_quest_template_id, r);
    }

    const data = typedTemplates.map((t: DailyQuestTemplate) => ({
      ...t,
      daily_quest_tasks: tasksByTemplate.get(t.id) || [],
      today_run: runByTemplate.get(t.id) || null,
    }));

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };
    log.error("daily quests admin GET error", { ...errorInfo });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const supabase = createAdminClient();

  try {
    const payload = (await req.json()) as DailyQuestTemplatePayload;

    const title = (payload.title || "").trim();
    const description = (payload.description || "").trim();
    const tasks = Array.isArray(payload.daily_quest_tasks)
      ? payload.daily_quest_tasks
      : [];
    const lockAddress = (payload.lock_address || "").trim();

    if (!title)
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 },
      );
    }
    if (!tasks.length) {
      return NextResponse.json(
        { error: "At least one task is required" },
        { status: 400 },
      );
    }

    if (lockAddress && !isAddress(lockAddress)) {
      return NextResponse.json(
        { error: "Invalid lock address" },
        { status: 400 },
      );
    }

    const bonus = payload.completion_bonus_reward_amount ?? 0;
    if (!Number.isInteger(bonus) || bonus < 0) {
      return NextResponse.json(
        { error: "Completion bonus reward amount must be an integer >= 0" },
        { status: 400 },
      );
    }

    const orderErr = validateOrderIndexes(tasks);
    if (orderErr)
      return NextResponse.json({ error: orderErr }, { status: 400 });

    const eligibilityValidation = await validateEligibilityConfig(
      payload.eligibility_config,
    );
    if (!eligibilityValidation.ok) {
      return NextResponse.json(
        { error: eligibilityValidation.error },
        { status: 400 },
      );
    }

    const normalizedEligibility = normalizeEligibilityConfig(
      payload.eligibility_config,
    );

    const taskCfgValidation = await validateVendorTaskConfig(
      tasks.map((t) => ({
        title: t.title,
        task_type: t.task_type,
        task_config: t.task_config ?? undefined,
      })),
    );
    if (!taskCfgValidation.ok) {
      return NextResponse.json(
        { error: taskCfgValidation.error },
        { status: 400 },
      );
    }

    const { data: tmpl, error: tmplErr } = await supabase
      .from("daily_quest_templates")
      .insert({
        title,
        description,
        image_url: payload.image_url ?? null,
        is_active: payload.is_active ?? true,
        completion_bonus_reward_amount: bonus,
        lock_address: lockAddress || null,
        lock_manager_granted: payload.lock_manager_granted ?? false,
        grant_failure_reason: payload.grant_failure_reason ?? null,
        eligibility_config: normalizedEligibility,
      })
      .select("*")
      .single();

    if (tmplErr || !tmpl) {
      return NextResponse.json(
        { error: tmplErr?.message || "Failed to create daily quest template" },
        { status: 400 },
      );
    }

    const insertTasks = tasks.map((t) => ({
      daily_quest_template_id: tmpl.id,
      title: (t.title || "").trim(),
      description: (t.description || "").trim(),
      task_type: t.task_type,
      verification_method: t.verification_method,
      reward_amount: t.reward_amount ?? 0,
      order_index: t.order_index,
      task_config: t.task_config ?? {},
      input_required: t.input_required ?? false,
      input_label: t.input_label ?? null,
      input_placeholder: t.input_placeholder ?? null,
      input_validation: t.input_validation ?? null,
      requires_admin_review: t.requires_admin_review ?? false,
    }));

    const { error: taskInsertErr } = await supabase
      .from("daily_quest_tasks")
      .insert(insertTasks);
    if (taskInsertErr) {
      const { error: cleanupErr } = await supabase
        .from("daily_quest_templates")
        .delete()
        .eq("id", tmpl.id);
      if (cleanupErr) {
        log.error("Failed to cleanup orphan daily quest template", {
          dailyQuestTemplateId: tmpl.id,
          cleanupErr,
        });
      }

      return NextResponse.json(
        { error: taskInsertErr.message },
        { status: 400 },
      );
    }

    // On template creation (is_active=true): insert refresh dedupe row for today so first ensureTodayDailyRuns() call
    // on the same day does not send a redundant refresh broadcast.
    if (tmpl.is_active) {
      const { error: dedupeErr } = await supabase
        .from("daily_quest_notifications")
        .insert({
          daily_quest_template_id: tmpl.id,
          run_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (UTC)
          notification_type: "daily_quest_refresh",
        });
      if (dedupeErr && dedupeErr.code !== "23505") {
        log.error("daily quest notification dedupe insert failed", {
          dailyQuestTemplateId: tmpl.id,
          dedupeErr,
        });
      }

      broadcastTelegramNotification(
        supabase,
        "New daily quest available!",
        `"${tmpl.title}" is now live — complete it before UTC reset.`,
        "/lobby/quests",
        "daily_quest_created",
      ).catch((e) => log.warn("daily quest created broadcast failed", { e }));
    }

    return NextResponse.json({ success: true, data: tmpl }, { status: 201 });
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };
    log.error("daily quests admin POST error", { ...errorInfo });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
