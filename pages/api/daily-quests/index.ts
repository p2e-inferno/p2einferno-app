import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  walletValidationErrorToHttpStatus,
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

    const { data: progressRows, error: progressErr } =
      userId && runIds.length
        ? await supabase
            .from("user_daily_quest_progress")
            .select(
              "daily_quest_run_id,reward_claimed,completion_bonus_claimed",
            )
            .eq("user_id", userId)
            .in("daily_quest_run_id", runIds)
        : { data: [], error: null };

    if (progressErr) {
      log.error("Failed to fetch daily quest progress", { progressErr, userId });
      return res.status(500).json({
        error: "Failed to fetch daily quest progress",
      });
    }

    const { data: completionRows, error: completionErr } =
      userId && runIds.length
        ? await supabase
            .from("user_daily_task_completions")
            .select("daily_quest_run_id,submission_status,reward_claimed")
            .eq("user_id", userId)
            .in("daily_quest_run_id", runIds)
        : { data: [], error: null };

    if (completionErr) {
      log.error("Failed to fetch daily quest task completions", {
        completionErr,
        userId,
      });
      return res.status(500).json({
        error: "Failed to fetch daily quest task completions",
      });
    }

    type ProgressRow = {
      daily_quest_run_id: string;
      reward_claimed: boolean;
      completion_bonus_claimed: boolean;
    };

    type CompletionRow = {
      daily_quest_run_id: string;
      submission_status: string;
      reward_claimed: boolean;
    };

    const progressByRunId = new Map<
      string,
      {
        reward_claimed: boolean;
        completion_bonus_claimed: boolean;
      }
    >();
    for (const row of (progressRows || []) as ProgressRow[]) {
      progressByRunId.set(row.daily_quest_run_id, {
        reward_claimed: Boolean(row.reward_claimed),
        completion_bonus_claimed: Boolean(row.completion_bonus_claimed),
      });
    }

    const completionStatsByRunId = new Map<
      string,
      {
        tasksCompletedCount: number;
        hasPendingTaskRewards: boolean;
      }
    >();
    for (const row of (completionRows || []) as CompletionRow[]) {
      const existing = completionStatsByRunId.get(row.daily_quest_run_id) || {
        tasksCompletedCount: 0,
        hasPendingTaskRewards: false,
      };
      if (row.submission_status === "completed") {
        existing.tasksCompletedCount += 1;
      }
      if (row.submission_status === "completed" && !row.reward_claimed) {
        existing.hasPendingTaskRewards = true;
      }
      completionStatsByRunId.set(row.daily_quest_run_id, existing);
    }

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
        const status = walletValidationErrorToHttpStatus(walletErr);
        if (status >= 500) {
          // Internal error — wallet header is optional for listing, so log
          // and continue without eligibility wallet rather than failing.
          log.error("Unexpected wallet validation error in listing endpoint", {
            walletErr,
          });
        } else {
          // 4xx — client sent a bad header, surface the error
          const message =
            walletErr instanceof Error
              ? walletErr.message
              : "Invalid X-Active-Wallet header";
          return res.status(status).json({ error: message });
        }
      }

      if (!eligibilityWallet) {
        eligibilityWallet = await getUserPrimaryWallet(supabase, userId);
      }
    }

    const enriched = await Promise.all(
      typedRuns.map(async (run: DailyQuestRun) => {
        const template = templatesById.get(run.daily_quest_template_id) || null;
        const tasks = tasksByRunId.get(run.id) || [];
        const progress = progressByRunId.get(run.id) || null;
        const completionStats = completionStatsByRunId.get(run.id) || {
          tasksCompletedCount: 0,
          hasPendingTaskRewards: false,
        };

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
          progress,
          has_pending_task_rewards: completionStats.hasPendingTaskRewards,
          tasks_completed_count: completionStats.tasksCompletedCount,
          total_tasks_count: tasks.length,
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
