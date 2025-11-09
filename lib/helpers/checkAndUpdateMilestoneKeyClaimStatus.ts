import { getLogger } from "@/lib/utils/logger";
import { Address, PublicClient } from "viem";
import { getUserWalletAddresses } from "@/lib/auth/privy";
import { hasValidKey } from "@/lib/services/user-key-service";
import { SupabaseClient } from "@supabase/supabase-js";
const log = getLogger("helpers:checkAndUpdateMilestoneKeyClaimStatus");

export async function checkAndUpdateMilestoneKeyClaimStatus(
  milestoneId: string,
  userId: string,
  publicClient: PublicClient,
  lockAddress: Address,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    log.info(
      `Verifying key ownership for milestone ${milestoneId} after grant`
    );
    const walletAddresses = await getUserWalletAddresses(userId);
    const targetWallet = walletAddresses[0]!;
    const hasKey = await hasValidKey(
      publicClient,
      targetWallet as Address,
      lockAddress as Address
    );
    if (hasKey) {
      // Update milestone key tracking in database
      const { error: updateError } = await supabase
        .from("cohort_milestones")
        .update({
          key_claimed: true,
          key_claimed_at: new Date().toISOString(),
        })
        .eq("id", milestoneId);

      if (updateError) {
        log.error(
          `Failed to update key_claimed status for milestone ${milestoneId}:`,
          updateError
        );
      } else {
        log.info(
          `Successfully verified and recorded key claim for milestone ${milestoneId}`
        );
        return true;
      }
    } else {
      log.warn(
        `Key grant succeeded but verification failed for milestone ${milestoneId}. This may indicate a delay in blockchain state.`
      );
      return false;
    }
  } catch (verificationError) {
    log.error(
      `Error during key verification for milestone ${milestoneId}:`,
      verificationError
    );
    return false;
  }
  // This ensures all code paths return a value
  return false;
}
