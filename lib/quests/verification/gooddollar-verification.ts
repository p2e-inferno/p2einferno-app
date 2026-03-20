import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import type { TaskType } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getUserWalletAddresses } from "@/lib/auth/privy";
import {
  getIdentityExpiry,
  calculateExpiryTimestamp,
  isVerificationExpired,
} from "@/lib/gooddollar/identity-sdk";
import { resolveSafeGoodDollarWalletCandidates } from "@/lib/gooddollar/verification-ownership";

const log = getLogger("quests:verification:gooddollar");

interface GoodDollarTaskConfig {
  require_active?: boolean; // default true — checks expiry
}

async function resolveGoodDollarCandidateWallets(params: {
  userId: string;
  userAddress: string;
  supabase: SupabaseClient;
}) {
  const linkedWallets = await getUserWalletAddresses(params.userId);

  return resolveSafeGoodDollarWalletCandidates({
    supabase: params.supabase,
    privyUserId: params.userId,
    linkedWallets,
    preferredWallet: params.userAddress,
  });
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
          // Legacy/admin-set rows may lack a stored expiry. Re-check on-chain
          // across the user's safe linked wallets, constrained by the app-level
          // ownership map so wallet rotation cannot be used to game verification.
          const candidateWallets = await resolveGoodDollarCandidateWallets({
            userId,
            userAddress,
            supabase,
          });

          log.info(
            "No expiry in DB for verified user, falling back to linked-wallet on-chain check",
            {
              userId,
              userAddress,
              candidateWalletCount: candidateWallets.length,
            },
          );

          if (candidateWallets.length === 0) {
            return {
              success: false,
              error: "Could not confirm GoodDollar verification status — no eligible linked wallet found",
              code: "GOODDOLLAR_RPC_ERROR",
            };
          }

          let hadSuccessfulChainCheck = false;

          for (const candidateWallet of candidateWallets) {
            try {
              const expiryData = await getIdentityExpiry(candidateWallet);
              const expiryMs = calculateExpiryTimestamp(
                expiryData.lastAuthenticated,
                expiryData.authPeriod,
              );
              hadSuccessfulChainCheck = true;

              if (!isVerificationExpired(expiryMs)) {
                return {
                  success: true,
                  metadata: {
                    face_verification_expiry: null,
                    face_verification_wallet: candidateWallet,
                  },
                };
              }
            } catch (rpcError: unknown) {
              log.warn(
                "On-chain GoodDollar expiry check failed for linked wallet",
                {
                  userId,
                  candidateWallet,
                  error:
                    rpcError instanceof Error
                      ? rpcError.message
                      : String(rpcError),
                },
              );
            }
          }

          if (hadSuccessfulChainCheck) {
            return {
              success: false,
              error: "GoodDollar verification has expired — please re-verify",
              code: "VERIFICATION_EXPIRED",
            };
          }

          return {
            success: false,
            error: "Could not confirm GoodDollar verification status — please try again",
            code: "GOODDOLLAR_RPC_ERROR",
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
