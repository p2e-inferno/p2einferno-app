import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import type { TaskType } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:verification:gooddollar");

interface GoodDollarTaskConfig {
  require_active?: boolean; // default true — checks expiry
}

export class GoodDollarVerificationStrategy implements VerificationStrategy {
  async verify(
    _taskType: TaskType,
    _verificationData: Record<string, unknown>,
    userId: string,
    _userAddress: string,
    options?: VerificationOptions,
  ): Promise<VerificationResult> {
    const taskConfig = options?.taskConfig as GoodDollarTaskConfig | undefined;
    const requireActive = taskConfig?.require_active !== false; // default true

    try {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("users")
        .select("is_face_verified, face_verification_expiry")
        .eq("id", userId)
        .single();

      if (error) {
        log.error("Failed to query user GoodDollar status", { userId, error: error.message });
        return { success: false, error: "Failed to verify GoodDollar status", code: "DB_ERROR" };
      }

      if (!data?.is_face_verified) {
        return {
          success: false,
          error: "GoodDollar face verification not completed",
          code: "NOT_VERIFIED",
        };
      }

      if (requireActive && data.face_verification_expiry) {
        const expiry = new Date(data.face_verification_expiry);
        if (expiry < new Date()) {
          return {
            success: false,
            error: "GoodDollar verification has expired — please re-verify",
            code: "VERIFICATION_EXPIRED",
          };
        }
      }

      return {
        success: true,
        metadata: {
          face_verification_expiry: data.face_verification_expiry,
        },
      };
    } catch (error: unknown) {
      log.error("GoodDollar verification error", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: "Failed to verify GoodDollar status",
        code: "GOODDOLLAR_VERIFICATION_ERROR",
      };
    }
  }
}
