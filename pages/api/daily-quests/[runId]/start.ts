import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  WalletValidationError,
} from "@/lib/auth/privy";
import { evaluateDailyQuestEligibility } from "@/lib/quests/daily-quests/constraints";
import { DailyQuestRun } from "@/lib/supabase/types";

const log = getLogger("api:daily-quests:start");

function isRunActiveWindow(run: DailyQuestRun) {
  const now = Date.now();
  const starts = Date.parse(run.starts_at);
  const ends = Date.parse(run.ends_at);
  return run.status === "active" && now >= starts && now <= ends;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const runId = typeof req.query.runId === "string" ? req.query.runId : null;
  if (!runId) {
    return res.status(400).json({ error: "Missing runId" });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = authUser.id;

    const rawActiveWalletHeader = req.headers?.["x-active-wallet"];
    if (Array.isArray(rawActiveWalletHeader)) {
      return res
        .status(400)
        .json({ error: "Multiple X-Active-Wallet headers provided" });
    }

    let activeWallet: string | null = null;
    try {
      activeWallet = await extractAndValidateWalletFromHeader({
        userId,
        activeWalletHeader: rawActiveWalletHeader,
        context: "daily-quests:start",
        required: true,
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

    const supabase = createAdminClient();

    const { data: run, error: runErr } = await supabase
      .from("daily_quest_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();
    if (runErr) return res.status(500).json({ error: "Failed to fetch run" });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (!isRunActiveWindow(run)) {
      return res.status(409).json({ error: "RUN_CLOSED" });
    }

    const { data: template, error: tmplErr } = await supabase
      .from("daily_quest_templates")
      .select("id,eligibility_config")
      .eq("id", run.daily_quest_template_id)
      .maybeSingle();

    if (tmplErr || !template) {
      return res.status(404).json({ error: "Daily quest template not found" });
    }

    const eligibility = await evaluateDailyQuestEligibility(
      supabase,
      userId,
      activeWallet,
      template.eligibility_config ?? {},
    );

    if (!eligibility.eligible) {
      return res.status(403).json({ error: "INELIGIBLE", eligibility });
    }

    const { error: upsertErr } = await supabase
      .from("user_daily_quest_progress")
      .upsert(
        {
          user_id: userId,
          daily_quest_run_id: runId,
        },
        { onConflict: "user_id,daily_quest_run_id", ignoreDuplicates: true },
      );
    if (upsertErr) {
      log.error("Failed to start daily quest (progress upsert failed)", {
        runId,
        userId,
        upsertErr,
      });
      return res.status(500).json({ error: "Failed to start daily quest" });
    }

    const { data: progress, error: progErr } = await supabase
      .from("user_daily_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("daily_quest_run_id", runId)
      .maybeSingle();

    if (progErr || !progress) {
      return res.status(500).json({ error: "Failed to start daily quest" });
    }

    return res.status(200).json({ success: true, progress });
  } catch (error) {
    log.error("Error in daily quest start API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
