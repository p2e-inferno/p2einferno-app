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
import type {
  DailyQuestRun,
  DailyQuestRunTask,
  DailyQuestTemplate,
} from "@/lib/supabase/types";

const log = getLogger("api:daily-quests:index");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();

    const todayUtc = new Date().toISOString().slice(0, 10);

    const { data: runs, error: runErr } = await supabase
      .from("daily_quest_runs")
      .select("id,daily_quest_template_id,run_date,starts_at,ends_at,status")
      .eq("run_date", todayUtc)
      .eq("status", "active");

    if (runErr) {
      log.error("Failed to fetch daily quest runs", { runErr });
      return res.status(500).json({
        error: "Failed to fetch daily quest runs",
      });
    }

    const typedRuns = (runs || []) as DailyQuestRun[];
    const runIds = typedRuns.map((r: DailyQuestRun) => r.id);
    const templateIds = typedRuns.map(
      (r: DailyQuestRun) => r.daily_quest_template_id,
    );

    const { data: templates, error: tmplErr } = templateIds.length
      ? await supabase
          .from("daily_quest_templates")
          .select("*")
          .in("id", templateIds)
      : { data: [], error: null };

    if (tmplErr) {
      log.error("Failed to fetch daily quest templates", { tmplErr });
      return res.status(500).json({
        error: "Failed to fetch daily quest templates",
      });
    }

    const { data: runTasks, error: taskErr } = runIds.length
      ? await supabase
          .from("daily_quest_run_tasks")
          .select("*")
          .in("daily_quest_run_id", runIds)
          .order("order_index")
      : { data: [], error: null };

    if (taskErr) {
      log.error("Failed to fetch daily quest tasks", { taskErr });
      return res.status(500).json({
        error: "Failed to fetch daily quest tasks",
      });
    }

    const typedTemplates = (templates || []) as DailyQuestTemplate[];
    const templatesById = new Map<string, DailyQuestTemplate>();
    for (const t of typedTemplates) templatesById.set(t.id, t);

    const typedRunTasks = (runTasks || []) as DailyQuestRunTask[];
    const tasksByRunId = new Map<string, DailyQuestRunTask[]>();
    for (const t of typedRunTasks) {
      const runId = t.daily_quest_run_id;
      if (!tasksByRunId.has(runId)) tasksByRunId.set(runId, []);
      tasksByRunId.get(runId)!.push(t);
    }

    const authUser = await getPrivyUser(req);
    const userId = authUser?.id || null;

    let eligibilityWallet: string | null = null;
    if (userId) {
      const rawActiveWalletHeader = req.headers?.["x-active-wallet"];
      if (Array.isArray(rawActiveWalletHeader)) {
        return res
          .status(400)
          .json({ error: "Multiple X-Active-Wallet headers provided" });
      }

      try {
        eligibilityWallet = await extractAndValidateWalletFromHeader({
          userId,
          activeWalletHeader: rawActiveWalletHeader,
          context: "daily-quests:list",
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
    }

    const enriched = await Promise.all(
      typedRuns.map(async (run: DailyQuestRun) => {
        const template = templatesById.get(run.daily_quest_template_id) || null;
        const tasks = tasksByRunId.get(run.id) || [];

        const base = {
          id: run.id,
          run_date: run.run_date,
          starts_at: run.starts_at,
          ends_at: run.ends_at,
          status: run.status,
          completion_bonus_reward_amount:
            Number(template?.completion_bonus_reward_amount || 0) || 0,
          template: template
            ? {
                id: template.id,
                title: template.title,
                description: template.description,
                image_url: template.image_url ?? null,
                lock_address: template.lock_address ?? null,
                eligibility_config: template.eligibility_config ?? {},
              }
            : null,
          daily_quest_run_tasks: tasks,
        };

        if (!userId) {
          return base;
        }

        const eligibility = template
          ? await evaluateDailyQuestEligibility(
              supabase,
              userId,
              eligibilityWallet,
              template.eligibility_config ?? {},
            )
          : null;

        return {
          ...base,
          eligibility: eligibility || undefined,
          eligibility_evaluated_wallet: eligibilityWallet,
        };
      }),
    );

    return res.status(200).json({ runs: enriched });
  } catch (error) {
    log.error("Error in daily quests list API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
