import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  WalletValidationError,
} from "@/lib/auth/privy";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { grantKeyToUser } from "@/lib/services/user-key-service";
import { extractTokenTransfers } from "@/lib/blockchain/shared/transaction-utils";
import { randomUUID } from "crypto";

const log = getLogger("api:daily-quests:complete-quest");

function isRunActiveWindow(run: any) {
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

  const { dailyQuestRunId } = (req.body || {}) as { dailyQuestRunId?: string };
  if (!dailyQuestRunId) {
    return res.status(400).json({ error: "Missing required fields" });
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
        context: "daily-quests:complete-quest",
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
      .eq("id", dailyQuestRunId)
      .maybeSingle();

    if (runErr) return res.status(500).json({ error: "Failed to fetch run" });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (!isRunActiveWindow(run)) {
      return res.status(409).json({ error: "RUN_CLOSED" });
    }

    const { data: template, error: tmplErr } = await supabase
      .from("daily_quest_templates")
      .select("*")
      .eq("id", run.daily_quest_template_id)
      .maybeSingle();

    if (tmplErr)
      return res.status(500).json({ error: "Failed to fetch template" });
    if (!template) return res.status(404).json({ error: "Template not found" });

    if (!template.lock_address) {
      return res.status(400).json({
        error: "LOCK_NOT_CONFIGURED",
        message: "Daily quest is not configured with a completion lock address",
      });
    }

    const { data: progress, error: progressErr } = await supabase
      .from("user_daily_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("daily_quest_run_id", dailyQuestRunId)
      .maybeSingle();

    if (progressErr) {
      return res.status(500).json({ error: "Failed to fetch progress" });
    }
    if (!progress) {
      return res.status(404).json({ error: "Daily quest progress not found" });
    }

    const { data: tasks, error: tasksErr } = await supabase
      .from("daily_quest_run_tasks")
      .select("id")
      .eq("daily_quest_run_id", dailyQuestRunId);
    if (tasksErr) {
      return res.status(500).json({ error: "Failed to fetch run tasks" });
    }

    const { data: completions, error: compErr } = await supabase
      .from("user_daily_task_completions")
      .select("id")
      .eq("user_id", userId)
      .eq("daily_quest_run_id", dailyQuestRunId)
      .eq("submission_status", "completed");

    if (compErr) {
      return res
        .status(500)
        .json({ error: "Failed to fetch task completions" });
    }

    const totalTasks = (tasks || []).length;
    const completedTasks = (completions || []).length;

    if (totalTasks === 0 || completedTasks < totalTasks) {
      return res.status(400).json({ error: "Daily quest not completed yet" });
    }

    const publicClient = createPublicClientUnified();

    // If key already claimed, do not grant another key. Bonus can still be retried.
    if (progress.reward_claimed) {
      const transactionHash = progress.key_claim_tx_hash ?? null;
      const keyTokenId = progress.key_claim_token_id
        ? String(progress.key_claim_token_id)
        : null;

      const bonusAmount = Number(template.completion_bonus_reward_amount || 0);
      let completionBonusAwarded = false;

      if (bonusAmount > 0 && !progress.completion_bonus_claimed) {
        const nowIso = new Date().toISOString();
        const { data: bonusGate, error: bonusGateErr } = await supabase
          .from("user_daily_quest_progress")
          .update({
            completion_bonus_claimed: true,
            completion_bonus_amount: bonusAmount,
            completion_bonus_claimed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", progress.id)
          .eq("user_id", userId)
          .eq("completion_bonus_claimed", false)
          .select("id")
          .maybeSingle();

        if (bonusGateErr) {
          log.error("Failed to gate completion bonus claim", {
            dailyQuestRunId,
            userId,
            bonusGateErr,
          });
          return res.status(503).json({
            error: "BONUS_GATE_FAILED",
            message: "Completion bonus was not finalized. Please retry.",
            transactionHash,
            keyTokenId,
            completionBonusRewardAmount: bonusAmount,
            completionBonusAwarded: false,
            attestationRequired: false,
          });
        }

        if (bonusGate) {
          const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select("id")
            .eq("privy_user_id", userId)
            .maybeSingle();

          if (profileError || !profile) {
            log.error("Failed to resolve user profile for completion bonus", {
              dailyQuestRunId,
              userId,
              profileError,
            });

            await supabase
              .from("user_daily_quest_progress")
              .update({
                completion_bonus_claimed: false,
                completion_bonus_amount: 0,
                completion_bonus_claimed_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", progress.id)
              .eq("user_id", userId);

            return res.status(500).json({
              error: "BONUS_PROFILE_NOT_FOUND",
              message: "Completion bonus could not be awarded. Please retry.",
              transactionHash,
              keyTokenId,
              completionBonusRewardAmount: bonusAmount,
              completionBonusAwarded: false,
              attestationRequired: false,
            });
          }

          const { error: bonusXpError } = await supabase.rpc(
            "award_xp_to_user",
            {
              p_user_id: profile.id,
              p_xp_amount: bonusAmount,
              p_activity_type: "daily_quest_completion_bonus_claimed",
              p_activity_data: {
                daily_quest_run_id: dailyQuestRunId,
                daily_quest_template_id: template.id,
                completion_bonus_amount: bonusAmount,
                key_claim_tx_hash: transactionHash ?? null,
              },
            },
          );

          if (bonusXpError) {
            log.error("award_xp_to_user failed for completion bonus", {
              dailyQuestRunId,
              userId,
              bonusXpError,
            });

            await supabase
              .from("user_daily_quest_progress")
              .update({
                completion_bonus_claimed: false,
                completion_bonus_amount: 0,
                completion_bonus_claimed_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", progress.id)
              .eq("user_id", userId);

            return res.status(503).json({
              error: "BONUS_AWARD_FAILED",
              message: "Completion bonus was not finalized. Please retry.",
              transactionHash,
              keyTokenId,
              completionBonusRewardAmount: bonusAmount,
              completionBonusAwarded: false,
              attestationRequired: false,
            });
          }

          completionBonusAwarded = true;
        }
      }

      return res.status(200).json({
        success: true,
        message: "Daily quest completion already claimed",
        transactionHash,
        keyTokenId,
        completionBonusRewardAmount:
          Number(template.completion_bonus_reward_amount || 0) || 0,
        completionBonusAwarded,
        attestationRequired: false,
      });
    }

    // Claim-gate before the on-chain write so concurrent requests cannot double-grant.
    // Uses key_claim_tx_hash as a "pending:<uuid>" marker while reward_claimed=false.
    const claimToken = `pending:${randomUUID()}`;
    const nowIso = new Date().toISOString();
    const { data: claimGate, error: claimGateErr } = await supabase
      .from("user_daily_quest_progress")
      .update({
        key_claim_tx_hash: claimToken,
        updated_at: nowIso,
      })
      .eq("id", progress.id)
      .eq("user_id", userId)
      .eq("daily_quest_run_id", dailyQuestRunId)
      .eq("reward_claimed", false)
      .is("key_claim_tx_hash", null)
      .select("id")
      .maybeSingle();

    if (claimGateErr) {
      log.error("Failed to gate daily quest key claim", {
        dailyQuestRunId,
        userId,
        claimGateErr,
      });
      return res.status(503).json({
        error: "CLAIM_GATE_FAILED",
        message: "Daily quest completion was not finalized. Please retry.",
      });
    }

    if (!claimGate) {
      const { data: latest, error: latestErr } = await supabase
        .from("user_daily_quest_progress")
        .select("reward_claimed,key_claim_tx_hash,key_claim_token_id")
        .eq("id", progress.id)
        .eq("user_id", userId)
        .eq("daily_quest_run_id", dailyQuestRunId)
        .maybeSingle();

      if (latestErr) {
        log.error("Failed to re-read progress after losing claim gate", {
          dailyQuestRunId,
          userId,
          latestErr,
        });
        return res.status(503).json({
          error: "CLAIM_GATE_LOST",
          message: "Daily quest completion is being finalized. Please retry.",
        });
      }

      if (latest?.reward_claimed) {
        return res.status(200).json({
          success: true,
          message: "Daily quest completion already claimed",
          transactionHash: latest.key_claim_tx_hash ?? null,
          keyTokenId: latest.key_claim_token_id
            ? String(latest.key_claim_token_id)
            : null,
          completionBonusRewardAmount:
            Number(template.completion_bonus_reward_amount || 0) || 0,
          completionBonusAwarded: Boolean(progress.completion_bonus_claimed),
          attestationRequired: false,
        });
      }

      return res.status(409).json({
        error: "CLAIM_IN_PROGRESS",
        message:
          "Daily quest completion is already being finalized. Please retry.",
      });
    }

    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      await supabase
        .from("user_daily_quest_progress")
        .update({
          key_claim_tx_hash: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", progress.id)
        .eq("user_id", userId)
        .eq("daily_quest_run_id", dailyQuestRunId)
        .eq("reward_claimed", false)
        .eq("key_claim_tx_hash", claimToken);

      return res.status(500).json({
        error: "Server wallet not configured for key granting",
      });
    }

    const grantResult = await grantKeyToUser(
      walletClient,
      publicClient,
      userId,
      template.lock_address,
    );

    if (!grantResult.success) {
      await supabase
        .from("user_daily_quest_progress")
        .update({
          key_claim_tx_hash: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", progress.id)
        .eq("user_id", userId)
        .eq("daily_quest_run_id", dailyQuestRunId)
        .eq("reward_claimed", false)
        .eq("key_claim_tx_hash", claimToken);

      log.error("Daily quest key grant failed", {
        dailyQuestRunId,
        userId,
        error: grantResult.error,
      });
      return res.status(500).json({
        error:
          grantResult.error ||
          "Failed to grant daily completion key on-chain. Please try again.",
      });
    }

    let keyTokenId: string | null = null;
    const transactionHash = grantResult.transactionHash;

    if (transactionHash) {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: transactionHash as `0x${string}`,
          confirmations: 1,
        });
        const transfers = extractTokenTransfers(receipt);
        const normalizedWallet = (activeWallet || "").toLowerCase();
        const matching = transfers.find(
          (t) => t.to.toLowerCase() === normalizedWallet,
        );
        if (matching) {
          keyTokenId = matching.tokenId.toString();
        } else if (transfers.length > 0) {
          keyTokenId = transfers[0]!.tokenId.toString();
        }
      } catch (error: any) {
        log.warn(
          "Failed to extract tokenId from daily quest key grant receipt",
          {
            dailyQuestRunId,
            userId,
            transactionHash,
            error: error?.message || String(error),
          },
        );
      }
    }

    const { error: updateError } = await supabase
      .from("user_daily_quest_progress")
      .update({
        reward_claimed: true,
        key_claim_tx_hash: transactionHash ?? null,
        key_claim_token_id: keyTokenId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", progress.id)
      .eq("user_id", userId)
      .eq("daily_quest_run_id", dailyQuestRunId)
      .eq("reward_claimed", false)
      .eq("key_claim_tx_hash", claimToken);

    if (updateError) {
      log.error("Failed to update daily quest progress after key grant", {
        dailyQuestRunId,
        userId,
        updateError,
      });
      // Don't fail the response if key was successfully granted
    }

    // Completion bonus award (after key grant)
    const bonusAmount = Number(template.completion_bonus_reward_amount || 0);
    let completionBonusAwarded = false;

    if (bonusAmount > 0) {
      // 1) Claim-gate at the DB layer so award_xp_to_user runs at most once.
      const nowIso = new Date().toISOString();
      const { data: bonusGate, error: bonusGateErr } = await supabase
        .from("user_daily_quest_progress")
        .update({
          completion_bonus_claimed: true,
          completion_bonus_amount: bonusAmount,
          completion_bonus_claimed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", progress.id)
        .eq("user_id", userId)
        .eq("completion_bonus_claimed", false)
        .select("id")
        .maybeSingle();

      if (bonusGateErr) {
        log.error("Failed to gate completion bonus claim", {
          dailyQuestRunId,
          userId,
          bonusGateErr,
        });
        return res.status(503).json({
          error: "BONUS_GATE_FAILED",
          message: "Completion bonus was not finalized. Please retry.",
          transactionHash: transactionHash ?? null,
          keyTokenId: keyTokenId ?? null,
          completionBonusRewardAmount: bonusAmount,
          completionBonusAwarded: false,
          attestationRequired: false,
        });
      }

      // 2) Only award XP if we won the gate.
      if (bonusGate) {
        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("privy_user_id", userId)
          .maybeSingle();

        if (profileError || !profile) {
          log.error("Failed to resolve user profile for completion bonus", {
            dailyQuestRunId,
            userId,
            profileError,
          });

          await supabase
            .from("user_daily_quest_progress")
            .update({
              completion_bonus_claimed: false,
              completion_bonus_amount: 0,
              completion_bonus_claimed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", progress.id)
            .eq("user_id", userId);

          return res.status(500).json({
            error: "BONUS_PROFILE_NOT_FOUND",
            message: "Completion bonus could not be awarded. Please retry.",
            transactionHash: transactionHash ?? null,
            keyTokenId: keyTokenId ?? null,
            completionBonusRewardAmount: bonusAmount,
            completionBonusAwarded: false,
            attestationRequired: false,
          });
        }

        const { error: bonusXpError } = await supabase.rpc("award_xp_to_user", {
          p_user_id: profile.id,
          p_xp_amount: bonusAmount,
          p_activity_type: "daily_quest_completion_bonus_claimed",
          p_activity_data: {
            daily_quest_run_id: dailyQuestRunId,
            daily_quest_template_id: template.id,
            completion_bonus_amount: bonusAmount,
            key_claim_tx_hash: transactionHash ?? null,
          },
        });

        if (bonusXpError) {
          log.error("award_xp_to_user failed for completion bonus", {
            dailyQuestRunId,
            userId,
            bonusXpError,
          });

          await supabase
            .from("user_daily_quest_progress")
            .update({
              completion_bonus_claimed: false,
              completion_bonus_amount: 0,
              completion_bonus_claimed_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", progress.id)
            .eq("user_id", userId);

          return res.status(503).json({
            error: "BONUS_AWARD_FAILED",
            message: "Completion bonus was not finalized. Please retry.",
            transactionHash: transactionHash ?? null,
            keyTokenId: keyTokenId ?? null,
            completionBonusRewardAmount: bonusAmount,
            completionBonusAwarded: false,
            attestationRequired: false,
          });
        }

        completionBonusAwarded = true;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Daily quest completed and key granted successfully",
      transactionHash,
      keyTokenId,
      completionBonusRewardAmount: bonusAmount,
      completionBonusAwarded,
      attestationRequired: false,
      ...(updateError
        ? {
            dbWarning: {
              message:
                "Key grant succeeded but progress persistence failed; please refresh and contact support if this repeats.",
              code: updateError.code ?? null,
              details: updateError.message,
            },
          }
        : {}),
    });
  } catch (error) {
    log.error("Error in daily quest complete-quest API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
