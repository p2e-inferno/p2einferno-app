import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";
import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";
import type { DelegatedAttestationSignature } from "@/lib/attestation/api/types";
import { isEASEnabled } from "@/lib/attestation/core/config";
import {
  buildEasScanLink,
} from "@/lib/attestation/core/network-config";

const log = getLogger("api:user:task:[taskId]:claim");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const user = await getPrivyUser(req);
    if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

    const { attestationSignature } = (req.body || {}) as {
      attestationSignature?: DelegatedAttestationSignature | null;
    };

    const { taskId } = req.query;
    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    // Load task with milestone dates
    const { data: task, error: taskErr } = await supabase
      .from("milestone_tasks")
      .select(
        `id, reward_amount, milestone:milestone_id(id, cohort_id, start_date, end_date, lock_address)`,
      )
      .eq("id", taskId)
      .single();
    if (taskErr || !task)
      return res.status(404).json({ error: "Task not found" });

    const milestone = Array.isArray(task.milestone)
      ? task.milestone[0]
      : task.milestone;
    const cohortId = milestone?.cohort_id;

    // Get user profile
    const { data: profile, error: profileErr } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id, wallet_address")
      .eq("privy_user_id", user.id)
      .maybeSingle();
    if (profileErr || !profile)
      return res.status(404).json({ error: "User profile not found" });

    // Verify user is enrolled in the cohort (including completed enrollments)
    const { data: enrollment } = await supabase
      .from("bootcamp_enrollments")
      .select("id")
      .eq("user_profile_id", profile.id)
      .eq("cohort_id", cohortId)
      .in("enrollment_status", ["enrolled", "active", "completed"])
      .maybeSingle();
    if (!enrollment)
      return res.status(403).json({ error: "Not enrolled in this cohort" });

    // Get task progress for this user
    const { data: utp } = await supabase
      .from("user_task_progress")
      .select("id, status, submission_id, reward_claimed")
      .eq("user_profile_id", profile.id)
      .eq("task_id", taskId)
      .maybeSingle();
    if (!utp) return res.status(400).json({ error: "Task not completed yet" });
    if (utp.status !== "completed")
      return res.status(400).json({ error: "Task not completed yet" });
    if (utp.reward_claimed)
      return res.status(400).json({ error: "Reward already claimed" });

    // Fetch the associated submission to check submitted_at timing
    const { data: submission } = await supabase
      .from("task_submissions")
      .select("id, submitted_at")
      .eq("id", utp.submission_id || "")
      .maybeSingle();

    const endDate = milestone?.end_date ? new Date(milestone.end_date) : null;
    const submittedAt = submission?.submitted_at
      ? new Date(submission.submitted_at)
      : null;

    let eligible = true;
    if (endDate && submittedAt) {
      // Eligible if submission was before or on the deadline, regardless of approval time
      eligible = submittedAt.getTime() <= endDate.getTime();
    }

    if (!eligible) {
      return res.status(400).json({ error: "Reward eligibility expired" });
    }

    // Optional gasless attestation (required when EAS is enabled unless graceful-degrade is configured).
    // NOTE: We do this before DB updates to avoid marking rewards claimed if the attestation is required and fails.
    const milestoneLockAddress =
      typeof milestone?.lock_address === "string"
        ? milestone.lock_address
        : null;
    const userWalletAddress =
      typeof profile.wallet_address === "string"
        ? profile.wallet_address
        : null;

    let rewardClaimAttestationUid: string | undefined;
    let rewardClaimAttestationTxHash: string | undefined;
    let attestationScanUrl: string | null = null;

    if (isEASEnabled() && !userWalletAddress) {
      return res.status(500).json({
        error: "User profile wallet address not configured",
      });
    }

    if (userWalletAddress) {
      const attestationResult = await handleGaslessAttestation({
        signature: attestationSignature ?? null,
        schemaKey: "milestone_task_reward_claim",
        recipient: userWalletAddress,
        // Phase 3 is DB-only and must be fail-closed when EAS is enabled.
        // Do not allow env-driven graceful degradation for this action.
        gracefulDegrade: false,
      });

      if (!attestationResult.success) {
        const message =
          attestationResult.error || "Failed to create attestation";
        const status =
          message === "Attestation signature is required" ||
          message === "Signature recipient mismatch" ||
          message === "Signature schema UID mismatch"
            ? 400
            : 500;
        return res.status(status).json({ error: message });
      }

      rewardClaimAttestationUid = attestationResult.uid;
      rewardClaimAttestationTxHash = attestationResult.txHash;

      if (rewardClaimAttestationUid) {
        attestationScanUrl = await buildEasScanLink(rewardClaimAttestationUid);
      }
    }

    // Mark claimed
    const claimUpdate: Record<string, any> = {
      reward_claimed: true,
      updated_at: new Date().toISOString(),
    };
    if (rewardClaimAttestationUid) {
      claimUpdate.reward_claim_attestation_uid = rewardClaimAttestationUid;
    }
    const { error: updateErr } = await supabase
      .from("user_task_progress")
      .update(claimUpdate)
      .eq("id", utp.id);
    if (updateErr)
      return res
        .status(500)
        .json({ error: "Failed to mark reward as claimed" });

    // Increment user XP (experience_points) and log activity
    const rewardAmount: number = task.reward_amount || 0;
    if (rewardAmount > 0) {
      // Get current experience points first
      const { data: currentProfile, error: fetchErr } = await supabase
        .from("user_profiles")
        .select("experience_points")
        .eq("id", profile.id)
        .single();

      if (fetchErr) {
        log.error("Failed to fetch current experience points:", fetchErr);
        return res
          .status(500)
          .json({ error: "Failed to update experience points" });
      }

      // Update experience points with the new total
      const newExperiencePoints =
        (currentProfile?.experience_points || 0) + rewardAmount;
      const { error: xpErr } = await supabase
        .from("user_profiles")
        .update({
          experience_points: newExperiencePoints,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (xpErr) {
        log.error("Failed to increment experience points:", xpErr);
        return res
          .status(500)
          .json({ error: "Failed to update experience points" });
      }

      // Insert activity record (best-effort)
      const { error: actErr } = await supabase.from("user_activities").insert({
        user_profile_id: profile.id,
        activity_type: "bootcamp_task_claimed",
        activity_data: {
          task_id: taskId,
          milestone_id: milestone?.id,
          cohort_id: cohortId,
          attestation_uid: rewardClaimAttestationUid,
          attestation_tx_hash: rewardClaimAttestationTxHash,
          milestone_lock_address: milestoneLockAddress,
        },
        points_earned: rewardAmount,
      } as any);
      if (actErr) {
        log.error("Failed to insert user activity:", actErr);
      }
    }

    return res.status(200).json({
      success: true,
      reward_amount: rewardAmount,
      attestationUid: rewardClaimAttestationUid || null,
      attestationScanUrl,
    });
  } catch (e: any) {
    log.error("Claim error:", e);
    return res
      .status(500)
      .json({ error: e.message || "Internal server error" });
  }
}
