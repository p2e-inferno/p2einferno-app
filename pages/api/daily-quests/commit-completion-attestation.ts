import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getPrivyUser,
  walletValidationErrorToHttpStatus,
} from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import type { DelegatedAttestationSignature } from "@/lib/attestation/api/types";
import {
  handleGaslessAttestation,
  extractAndValidateWalletFromSignature,
} from "@/lib/attestation/api/helpers";
import { buildEasScanLink } from "@/lib/attestation/core/network-config";
import { getDefaultNetworkName } from "@/lib/attestation/core/network-config";
import {
  decodeAttestationDataFromDb,
  getDecodedFieldValue,
  normalizeBytes32,
  normalizeUint,
} from "@/lib/attestation/api/commit-guards";

const log = getLogger("api:daily-quests:commit-completion-attestation");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { dailyQuestRunId, attestationSignature } = (req.body || {}) as {
      dailyQuestRunId?: string;
      attestationSignature?: DelegatedAttestationSignature | null;
    };

    log.info("Daily quest completion attestation commit requested", {
      userId: authUser.id,
      dailyQuestRunId,
      hasSignature: Boolean(attestationSignature),
      signatureNetwork: attestationSignature?.network || null,
      signatureChainId: attestationSignature?.chainId || null,
    });

    if (!dailyQuestRunId) {
      return res.status(400).json({ error: "dailyQuestRunId is required" });
    }

    if (!isEASEnabled()) {
      return res.status(200).json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
      });
    }

    let userWallet: string;
    try {
      const wallet = await extractAndValidateWalletFromSignature({
        userId: authUser.id,
        attestationSignature: attestationSignature ?? null,
        context: "daily-quest-completion-commit",
      });
      if (!wallet) {
        return res.status(400).json({ error: "Wallet is required" });
      }
      userWallet = wallet;
    } catch (walletErr: unknown) {
      const status = walletValidationErrorToHttpStatus(walletErr);
      const safeStatus = status === 500 ? 403 : status;
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Wallet validation failed";
      return res.status(safeStatus).json({ error: message });
    }

    const supabase = createAdminClient();

    const { data: progress, error: progressError } = await supabase
      .from("user_daily_quest_progress")
      .select(
        "id,reward_claimed,key_claim_attestation_uid,key_claim_tx_hash,key_claim_token_id,daily_quest_run_id",
      )
      .eq("user_id", authUser.id)
      .eq("daily_quest_run_id", dailyQuestRunId)
      .maybeSingle();

    if (progressError) {
      log.error("Failed to fetch daily quest progress for commit", {
        dailyQuestRunId,
        userId: authUser.id,
        error: progressError,
      });
      return res
        .status(500)
        .json({ error: "Failed to verify daily quest progress" });
    }

    if (!progress?.reward_claimed) {
      return res.status(400).json({ error: "Daily quest key not claimed yet" });
    }

    const existingUid = (progress as any)?.key_claim_attestation_uid as
      | string
      | null
      | undefined;
    if (existingUid) {
      log.info("Daily completion attestation already exists (idempotent)", {
        userId: authUser.id,
        dailyQuestRunId,
        attestationUid: existingUid,
      });
      return res.status(200).json({
        success: true,
        attestationUid: existingUid,
        attestationScanUrl: await buildEasScanLink(existingUid),
      });
    }

    if (!attestationSignature) {
      return res
        .status(400)
        .json({ error: "Attestation signature is required" });
    }

    const { data: run, error: runError } = await supabase
      .from("daily_quest_runs")
      .select("id,daily_quest_template_id")
      .eq("id", dailyQuestRunId)
      .maybeSingle();

    if (runError || !run) {
      return res.status(404).json({ error: "Daily quest run not found" });
    }

    const { data: template, error: templateError } = await supabase
      .from("daily_quest_templates")
      .select("id,title,lock_address,completion_bonus_reward_amount")
      .eq("id", run.daily_quest_template_id)
      .maybeSingle();

    if (templateError || !template) {
      return res.status(404).json({ error: "Daily quest template not found" });
    }

    const networkForDecode =
      attestationSignature.network?.toLowerCase() || getDefaultNetworkName();

    const decoded = await decodeAttestationDataFromDb({
      supabase,
      schemaKey: "quest_completion",
      network: networkForDecode,
      encodedData: attestationSignature.data,
    });

    if (!decoded) {
      log.warn("Daily completion attestation decode failed", {
        userId: authUser.id,
        dailyQuestRunId,
        schemaKey: "quest_completion",
        networkForDecode,
        signatureSchemaUid: attestationSignature.schemaUid,
      });
      return res.status(400).json({ error: "Invalid attestation payload" });
    }

    const decodedGrantTxHashRaw = getDecodedFieldValue(decoded, "grantTxHash");
    const decodedGrantTxHash = normalizeBytes32(decodedGrantTxHashRaw);
    const decodedTokenId = normalizeUint(
      getDecodedFieldValue(decoded, "keyTokenId"),
    );
    const decodedQuestLockAddressRaw = getDecodedFieldValue(
      decoded,
      "questLockAddress",
    );

    const expectedGrantTxHash = normalizeBytes32(
      (progress as any)?.key_claim_tx_hash,
    );
    const expectedTokenId = normalizeUint(
      (progress as any)?.key_claim_token_id,
    );
    const expectedQuestLockAddress =
      typeof template.lock_address === "string"
        ? template.lock_address.toLowerCase()
        : null;
    const decodedQuestLockAddress =
      typeof decodedQuestLockAddressRaw === "string"
        ? decodedQuestLockAddressRaw.toLowerCase()
        : null;

    if (!expectedGrantTxHash || expectedTokenId === null) {
      log.warn("Daily completion commit missing stored grant details", {
        userId: authUser.id,
        dailyQuestRunId,
        expectedGrantTxHash,
        expectedTokenId:
          expectedTokenId === null ? null : expectedTokenId.toString(),
      });
      return res.status(400).json({
        error: "Grant details not recorded for this daily quest completion",
      });
    }

    if (
      !decodedGrantTxHash ||
      !decodedTokenId ||
      decodedGrantTxHash !== expectedGrantTxHash ||
      decodedTokenId !== expectedTokenId
    ) {
      log.warn("Daily completion attestation payload mismatch", {
        userId: authUser.id,
        dailyQuestRunId,
        decodedGrantTxHash,
        expectedGrantTxHash,
        decodedTokenId:
          decodedTokenId === null ? null : decodedTokenId.toString(),
        expectedTokenId:
          expectedTokenId === null ? null : expectedTokenId.toString(),
      });
      return res.status(400).json({
        error: "Attestation payload does not match recorded grant details",
      });
    }

    if (
      !decodedQuestLockAddress ||
      !expectedQuestLockAddress ||
      decodedQuestLockAddress !== expectedQuestLockAddress
    ) {
      log.warn("Daily completion attestation lock mismatch", {
        userId: authUser.id,
        dailyQuestRunId,
        decodedQuestLockAddress,
        expectedQuestLockAddress,
      });
      return res.status(400).json({
        error: "Attestation payload does not match daily quest lock",
      });
    }

    const attestationResult = await handleGaslessAttestation({
      signature: attestationSignature,
      schemaKey: "quest_completion",
      recipient: userWallet,
      gracefulDegrade: true,
    });

    if (!attestationResult.success) {
      log.error("Daily completion attestation submission failed", {
        userId: authUser.id,
        dailyQuestRunId,
        error: attestationResult.error || "unknown",
      });
      return res.status(200).json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
        attestationError:
          attestationResult.error || "Attestation submission failed",
      });
    }

    const uid = attestationResult.uid || null;
    const attestationScanUrl = uid ? await buildEasScanLink(uid) : null;

    if (uid) {
      const { error: updateError } = await supabase
        .from("user_daily_quest_progress")
        .update({ key_claim_attestation_uid: uid })
        .eq("user_id", authUser.id)
        .eq("daily_quest_run_id", dailyQuestRunId);

      if (updateError) {
        log.error("Failed to persist daily key claim attestation UID", {
          dailyQuestRunId,
          userId: authUser.id,
          uid,
          error: updateError,
        });
        // Return an error so the client can retry — the attestation UID was not
        // recorded, meaning a subsequent existingUid guard won't prevent a duplicate.
        return res.status(500).json({
          error: "Attestation submitted but failed to record UID. Please retry.",
        });
      }
    }

    return res.status(200).json({
      success: true,
      attestationUid: uid,
      attestationScanUrl,
    });
  } catch (error: any) {
    log.error("Daily commit completion attestation error", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
