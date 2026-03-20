import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import type { TaskType } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getIdentityExpiry,
  calculateExpiryTimestamp,
  isVerificationExpired,
} from "@/lib/gooddollar/identity-sdk";

const log = getLogger("quests:verification:gooddollar");

interface GoodDollarTaskConfig {
  require_active?: boolean; // default true — checks expiry
}

export class GoodDollarVerificationStrategy implements VerificationStrategy {
  async verify(
    _taskType: TaskType,
    _verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    options?: VerificationOptions,
  ): Promise<VerificationResult> {
    const taskConfig = options?.taskConfig as GoodDollarTaskConfig | undefined;
    const requireActive = taskConfig?.require_active !== false; // default true

    try {
      const supabase = createAdminClient();

      const { data, error } = await supabase
        .from("user_profiles")
        .select("is_face_verified, face_verification_expiry")
        .eq("privy_user_id", userId)
        .maybeSingle();

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

      if (requireActive) {
        if (data.face_verification_expiry) {
          // Fast path: DB has a stored expiry — use it directly
          const expiry = new Date(data.face_verification_expiry);
          if (expiry < new Date()) {
            return {
              success: false,
              error: "GoodDollar verification has expired — please re-verify",
              code: "VERIFICATION_EXPIRED",
            };
          }
        } else {
          // Fallback: no expiry in DB (legacy/admin-set record) — verify on-chain
          log.info("No expiry in DB for verified user, falling back to on-chain check", { userId, userAddress });
          try {
            const expiryData = await getIdentityExpiry(userAddress as `0x${string}`);
            const expiryMs = calculateExpiryTimestamp(expiryData.lastAuthenticated, expiryData.authPeriod);
            if (isVerificationExpired(expiryMs)) {
              return {
                success: false,
                error: "GoodDollar verification has expired — please re-verify",
                code: "VERIFICATION_EXPIRED",
              };
            }
          } catch (rpcError: unknown) {
            log.warn("On-chain GoodDollar expiry check failed — cannot confirm verification status", {
              userId,
              userAddress,
              error: rpcError instanceof Error ? rpcError.message : String(rpcError),
            });
            return {
              success: false,
              error: "Could not confirm GoodDollar verification status — please try again",
              code: "GOODDOLLAR_RPC_ERROR",
            };
          }
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
