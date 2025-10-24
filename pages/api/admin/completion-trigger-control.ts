import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { withAdminAuth } from "@/lib/auth/admin-auth";

const log = getLogger("api:admin:completion-trigger-control");

interface TriggerControlRequest {
  action:
    | "activate_key_based"
    | "deactivate_key_based"
    | "get_status"
    | "backfill_keys";
  cohortId?: string; // For backfill_keys action
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const { action, cohortId }: TriggerControlRequest = req.body;

    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    switch (action) {
      case "get_status":
        const { data: statusData, error: statusError } = await supabase.rpc(
          "get_completion_trigger_status",
        );
        if (statusError) {
          log.error("Failed to get trigger status:", statusError);
          return res
            .status(500)
            .json({ error: "Failed to get trigger status" });
        }
        return res.status(200).json({ success: true, data: statusData });

      case "activate_key_based":
        const { data: activateData, error: activateError } = await supabase.rpc(
          "activate_milestone_key_completion",
        );
        if (activateError) {
          log.error("Failed to activate key-based completion:", activateError);
          return res
            .status(500)
            .json({ error: "Failed to activate key-based completion" });
        }
        log.info("Admin activated milestone key-based completion");
        return res.status(200).json({
          success: true,
          message: "Key-based completion trigger activated",
          data: activateData,
        });

      case "deactivate_key_based":
        const { data: deactivateData, error: deactivateError } =
          await supabase.rpc("deactivate_milestone_key_completion");
        if (deactivateError) {
          log.error(
            "Failed to deactivate key-based completion:",
            deactivateError,
          );
          return res
            .status(500)
            .json({ error: "Failed to deactivate key-based completion" });
        }
        log.info("Admin deactivated milestone key-based completion");
        return res.status(200).json({
          success: true,
          message: "Reverted to task-based completion trigger",
          data: deactivateData,
        });

      case "backfill_keys":
        const { data: backfillData, error: backfillError } = await supabase.rpc(
          "backfill_milestone_key_claims",
          { p_cohort_id: cohortId || null },
        );
        if (backfillError) {
          log.error("Failed to backfill milestone key claims:", backfillError);
          return res
            .status(500)
            .json({ error: "Failed to backfill milestone key claims" });
        }
        log.info(
          `Admin backfilled milestone key claims for cohort ${cohortId || "all"}`,
        );
        return res.status(200).json({
          success: true,
          message: "Milestone key claims backfilled",
          data: backfillData,
        });

      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error: any) {
    log.error("Completion trigger control error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}

export default withAdminAuth(handler);
