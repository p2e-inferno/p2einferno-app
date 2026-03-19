import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import type { TaskType } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:verification:in-app-pullout");

interface InAppPulloutTaskConfig {
  min_amount_dg?: number;
}

export class InAppPulloutVerificationStrategy implements VerificationStrategy {
  async verify(
    _taskType: TaskType,
    _verificationData: Record<string, unknown>,
    userId: string,
    _userAddress: string,
    options?: VerificationOptions,
  ): Promise<VerificationResult> {
    const taskConfig = options?.taskConfig as InAppPulloutTaskConfig | undefined;
    const minAmountDg = taskConfig?.min_amount_dg;

    try {
      const supabase = createAdminClient();

      let query = supabase
        .from("dg_token_withdrawals")
        .select("id, amount_dg, transaction_hash, completed_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1);

      if (minAmountDg !== undefined) {
        query = query.gte("amount_dg", minAmountDg);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        log.error("Failed to query dg_token_withdrawals", { userId, error: error.message });
        return { success: false, error: "Failed to verify pullout status", code: "DB_ERROR" };
      }

      if (!data) {
        const msg =
          minAmountDg !== undefined
            ? `No completed pullout of at least ${minAmountDg} DG found`
            : "No completed DG pullout found";
        return { success: false, error: msg, code: "PULLOUT_NOT_FOUND" };
      }

      return {
        success: true,
        metadata: {
          withdrawal_id: data.id,
          transaction_hash: data.transaction_hash,
          amount_dg: data.amount_dg,
          completed_at: data.completed_at,
        },
      };
    } catch (error: unknown) {
      log.error("In-app pullout verification error", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: "Failed to verify pullout status",
        code: "PULLOUT_VERIFICATION_ERROR",
      };
    }
  }
}
