import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import type { TaskType } from "@/lib/supabase/types";
import { getDefaultCheckinService } from "@/lib/checkin";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:verification:daily-checkin");

export class DailyCheckinVerificationStrategy implements VerificationStrategy {
  async verify(
    _taskType: TaskType,
    _verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    _options?: VerificationOptions,
  ): Promise<VerificationResult> {
    if (!userAddress) {
      return { success: false, error: "Wallet address is required", code: "WALLET_REQUIRED" };
    }

    try {
      const checkinService = getDefaultCheckinService();
      const canStillCheckin = await checkinService.canCheckinToday(userAddress);

      if (canStillCheckin) {
        // User has NOT checked in yet today
        return {
          success: false,
          error: "You must complete your daily check-in first",
          code: "CHECKIN_NOT_FOUND",
        };
      }

      // User HAS checked in today — task is verified
      return { success: true };
    } catch (error: unknown) {
      // canCheckinToday throws CheckinError on RPC failure; treat all thrown errors uniformly.
      log.error("Daily checkin verification failed", {
        userId,
        userAddress,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: "Failed to verify daily check-in status",
        code: "CHECKIN_VERIFICATION_ERROR",
      };
    }
  }
}
