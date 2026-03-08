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

const log = getLogger("api:quests:commit-completion-attestation");

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

    const { questId, attestationSignature } = (req.body || {}) as {
      questId?: string;
      attestationSignature?: DelegatedAttestationSignature | null;
    };

    log.info("Quest completion attestation commit requested", {
      userId: authUser.id,
      questId,
      hasSignature: Boolean(attestationSignature),
      signatureNetwork: attestationSignature?.network || null,
      signatureChainId: attestationSignature?.chainId || null,
    });

    if (!questId) {
      return res.status(400).json({ error: "questId is required" });
    }

    if (!isEASEnabled()) {
      return res.status(200).json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
      });
    }

    // Extract and validate wallet from attestation signature
    let userWallet: string;
    try {
      const wallet = await extractAndValidateWalletFromSignature({
        userId: authUser.id,
        attestationSignature: attestationSignature ?? null,
        context: "quest-completion-commit",
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
      .from("user_quest_progress")
      .select(
        "reward_claimed, is_completed, key_claim_attestation_uid, key_claim_tx_hash, key_claim_token_id",
      )
      .eq("user_id", authUser.id)
      .eq("quest_id", questId)
      .maybeSingle();

    if (progressError) {
      log.error("Failed to fetch quest progress for attestation commit", {
        questId,
        userId: authUser.id,
        error: progressError,
      });
      return res.status(500).json({ error: "Failed to verify quest progress" });
    }

    if (!progress?.reward_claimed || !progress?.is_completed) {
      return res.status(400).json({ error: "Quest not completed/claimed yet" });
    }

    // Idempotency: if an attestation UID already exists, don't resubmit.
    const existingUid = (progress as any)?.key_claim_attestation_uid as
      | string
      | null
      | undefined;
    if (existingUid) {
      log.info("Quest completion attestation already exists (idempotent)", {
        userId: authUser.id,
        questId,
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

    const networkForDecode =
      attestationSignature.network?.toLowerCase() || getDefaultNetworkName();

    const decoded = await decodeAttestationDataFromDb({
      supabase,
      schemaKey: "quest_completion",
      network: networkForDecode,
      encodedData: attestationSignature.data,
    });

    if (!decoded) {
      log.warn("Quest completion attestation decode failed", {
        userId: authUser.id,
        questId,
        schemaKey: "quest_completion",
        networkForDecode,
        signatureSchemaUid: attestationSignature.schemaUid,
      });
      return res.status(400).json({ error: "Invalid attestation payload" });
    }

    const decodedGrantTxHash = normalizeBytes32(
      getDecodedFieldValue(decoded, "grantTxHash"),
    );
    const decodedTokenId = normalizeUint(
      getDecodedFieldValue(decoded, "keyTokenId"),
    );

    const expectedGrantTxHash = normalizeBytes32(
      (progress as any)?.key_claim_tx_hash,
    );
    const expectedTokenId = normalizeUint(
      (progress as any)?.key_claim_token_id,
    );

    if (!expectedGrantTxHash || expectedTokenId === null) {
      log.warn("Quest completion commit missing stored grant details", {
        userId: authUser.id,
        questId,
        expectedGrantTxHash,
        expectedTokenId:
          expectedTokenId === null ? null : expectedTokenId.toString(),
      });
      return res.status(400).json({
        error: "Grant details not recorded for this quest completion",
      });
    }

    if (
      !decodedGrantTxHash ||
      !decodedTokenId ||
      decodedGrantTxHash !== expectedGrantTxHash ||
      decodedTokenId !== expectedTokenId
    ) {
      log.warn("Quest completion attestation payload mismatch", {
        userId: authUser.id,
        questId,
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

    const attestationResult = await handleGaslessAttestation({
      signature: attestationSignature,
      schemaKey: "quest_completion",
      recipient: userWallet,
      gracefulDegrade: true,
    });

    if (!attestationResult.success) {
      log.error("Quest completion attestation submission failed", {
        userId: authUser.id,
        questId,
        error: attestationResult.error || "unknown",
      });
      // On-chain action already happened; do not block the flow here.
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
        .from("user_quest_progress")
        .update({ key_claim_attestation_uid: uid })
        .eq("user_id", authUser.id)
        .eq("quest_id", questId);

      if (updateError) {
        log.error("Failed to persist quest key claim attestation UID", {
          questId,
          userId: authUser.id,
          uid,
          error: updateError,
        });
      }
    }

    return res.status(200).json({
      success: true,
      attestationUid: uid,
      attestationScanUrl,
    });
  } catch (error: any) {
    log.error("commit completion attestation error", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
