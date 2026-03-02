import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  WalletValidationError,
} from "@/lib/auth/privy";
import { getUserPrimaryWallet } from "@/lib/quests/prerequisite-checker";
import { evaluateDailyQuestEligibility } from "@/lib/quests/daily-quests/constraints";

const log = getLogger("api:daily-quests:[runId]");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const runId = typeof req.query.runId === "string" ? req.query.runId : null;
  if (!runId) {
    return res.status(400).json({ error: "Missing runId" });
  }

  try {
    const supabase = createAdminClient();

    const { data: run, error: runErr } = await supabase
      .from("daily_quest_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();

    if (runErr) {
      return res.status(500).json({ error: "Failed to fetch run" });
    }
    if (!run) return res.status(404).json({ error: "Run not found" });

    const { data: template, error: tmplErr } = await supabase
      .from("daily_quest_templates")
      .select("*")
      .eq("id", run.daily_quest_template_id)
      .maybeSingle();

    if (tmplErr) {
      return res.status(500).json({ error: "Failed to fetch template" });
    }

    const { data: tasks, error: taskErr } = await supabase
      .from("daily_quest_run_tasks")
      .select("*")
      .eq("daily_quest_run_id", runId)
      .order("order_index");

    if (taskErr) {
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }

    const authUser = await getPrivyUser(req);
    const userId = authUser?.id || null;

    if (!userId) {
      return res.status(200).json({
        run,
        template,
        daily_quest_run_tasks: tasks || [],
        completion_bonus_reward_amount:
          Number(template?.completion_bonus_reward_amount || 0) || 0,
      });
    }

    const rawActiveWalletHeader = req.headers?.["x-active-wallet"];
    if (Array.isArray(rawActiveWalletHeader)) {
      return res
        .status(400)
        .json({ error: "Multiple X-Active-Wallet headers provided" });
    }

    let eligibilityWallet: string | null = null;
    try {
      eligibilityWallet = await extractAndValidateWalletFromHeader({
        userId,
        activeWalletHeader: rawActiveWalletHeader,
        context: "daily-quests:detail",
        required: false,
      });
    } catch (walletErr: unknown) {
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Invalid X-Active-Wallet header";
      const status =
        walletErr instanceof WalletValidationError &&
        walletErr.code === "NOT_OWNED"
          ? 403
          : 400;
      return res.status(status).json({ error: message });
    }

    if (!eligibilityWallet) {
      eligibilityWallet = await getUserPrimaryWallet(supabase, userId);
    }

    const eligibility = template
      ? await evaluateDailyQuestEligibility(
          supabase,
          userId,
          eligibilityWallet,
          template.eligibility_config ?? {},
        )
      : null;

    const { data: progress, error: progErr } = await supabase
      .from("user_daily_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("daily_quest_run_id", runId)
      .maybeSingle();
    if (progErr) {
      return res.status(500).json({ error: "Failed to fetch progress" });
    }

    const { data: completions, error: compErr } = await supabase
      .from("user_daily_task_completions")
      .select("*")
      .eq("user_id", userId)
      .eq("daily_quest_run_id", runId);
    if (compErr) {
      return res.status(500).json({ error: "Failed to fetch completions" });
    }

    return res.status(200).json({
      run,
      template,
      daily_quest_run_tasks: tasks || [],
      progress,
      completions: completions || [],
      eligibility: eligibility || undefined,
      eligibility_evaluated_wallet: eligibilityWallet,
      completion_bonus_reward_amount:
        Number(template?.completion_bonus_reward_amount || 0) || 0,
    });
  } catch (error) {
    log.error("Error in daily quest detail API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
