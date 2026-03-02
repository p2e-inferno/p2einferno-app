import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { getLogger } from "@/lib/utils/logger";
import { validateVendorTaskConfig } from "@/lib/quests/vendor-task-config";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { isAddress } from "viem";

const log = getLogger("api:admin:daily-quests:[id]");

type DailyQuestTemplateUpdatePayload = {
  id?: string;
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
  eligibility:
    | DailyQuestTemplateUpdatePayload["eligibility_config"]
    | undefined,
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
  eligibility:
    | DailyQuestTemplateUpdatePayload["eligibility_config"]
    | undefined,
) {
  if (!eligibility) return {};
  const normalized: NonNullable<
    DailyQuestTemplateUpdatePayload["eligibility_config"]
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dailyQuestId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { dailyQuestId } = await params;
  const supabase = createAdminClient();

  try {
    const { data: tmpl, error: tmplErr } = await supabase
      .from("daily_quest_templates")
      .select("*")
      .eq("id", dailyQuestId)
      .maybeSingle();
    if (tmplErr)
      return NextResponse.json({ error: tmplErr.message }, { status: 400 });
    if (!tmpl)
      return NextResponse.json(
        { error: "Daily quest not found" },
        { status: 404 },
      );

    const { data: tasks, error: taskErr } = await supabase
      .from("daily_quest_tasks")
      .select("*")
      .eq("daily_quest_template_id", dailyQuestId)
      .order("order_index");
    if (taskErr)
      return NextResponse.json({ error: taskErr.message }, { status: 400 });

    return NextResponse.json(
      { success: true, data: { ...tmpl, daily_quest_tasks: tasks || [] } },
      { status: 200 },
    );
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };
    log.error("daily quests admin GET by id error", {
      ...errorInfo,
      dailyQuestId,
    });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ dailyQuestId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { dailyQuestId } = await params;
  const supabase = createAdminClient();

  try {
    const payload = (await req.json()) as DailyQuestTemplateUpdatePayload;

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

    const insertTasks = tasks.map((t) => ({
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

    // Atomic template update + task replacement (single DB transaction via RPC)
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "admin_replace_daily_quest_template_and_tasks",
      {
        p_template_id: dailyQuestId,
        p_title: title,
        p_description: description,
        p_image_url: payload.image_url ?? null,
        ...(typeof payload.is_active === "boolean"
          ? { p_is_active: payload.is_active }
          : {}),
        p_completion_bonus_reward_amount: bonus,
        p_lock_address: lockAddress || null,
        p_lock_manager_granted: payload.lock_manager_granted ?? false,
        p_grant_failure_reason: payload.grant_failure_reason ?? null,
        p_eligibility_config: normalizedEligibility,
        p_tasks: insertTasks,
      },
    );

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    const response =
      (rpcData as { success?: boolean; error?: string; data?: unknown }) || {};
    if (!response.success) {
      if (response.error === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Daily quest not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: response.error || "Failed to update daily quest" },
        { status: 400 },
      );
    }

    const updated = response.data;
    if (!updated) {
      return NextResponse.json(
        { error: "Daily quest not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: updated }, { status: 200 });
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };
    log.error("daily quests admin PUT error", { ...errorInfo, dailyQuestId });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ dailyQuestId: string }> },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { dailyQuestId } = await params;
  const supabase = createAdminClient();

  try {
    const payload = (await req.json()) as { is_active?: boolean };
    if (typeof payload.is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active must be boolean" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("daily_quest_templates")
      .update({
        is_active: payload.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dailyQuestId)
      .select("*")
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data)
      return NextResponse.json(
        { error: "Daily quest not found" },
        { status: 404 },
      );
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { message: String(error) };
    log.error("daily quests admin PATCH error", { ...errorInfo, dailyQuestId });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
