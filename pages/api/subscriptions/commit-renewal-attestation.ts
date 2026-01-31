import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import type { DelegatedAttestationSignature } from "@/lib/attestation/api/types";
import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";
import { buildEasScanLink } from "@/lib/attestation/core/network-config";
import { getDefaultNetworkName } from "@/lib/attestation/core/network-config";
import {
  decodeAttestationDataFromDb,
  getDecodedFieldValue,
  normalizeBytes32,
} from "@/lib/attestation/api/commit-guards";

const log = getLogger("api:subscriptions:commit-renewal-attestation");

type CommitRequest = {
  renewalAttemptId?: string;
  attestationSignature?: DelegatedAttestationSignature | null;
};

type CommitResponse = {
  success: boolean;
  attestationUid: string | null;
  attestationScanUrl: string | null;
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CommitResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      attestationUid: null,
      attestationScanUrl: null,
      error: "Method not allowed",
    });
  }

  try {
    const privyResult = await getPrivyUser(req, true);
    if (
      !privyResult ||
      !privyResult.id ||
      !("wallet" in privyResult) ||
      !privyResult.wallet?.address
    ) {
      return res.status(401).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Not authenticated",
      });
    }

    const { renewalAttemptId, attestationSignature } = (req.body ||
      {}) as CommitRequest;

    if (!renewalAttemptId) {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "renewalAttemptId is required",
      });
    }

    if (!isEASEnabled()) {
      return res.status(200).json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
      });
    }

    const privy = privyResult as any;
    const recipient = privy.wallet.address as string;

    const supabase = createAdminClient();

    const { data: attempt, error: attemptError } = await supabase
      .from("subscription_renewal_attempts")
      .select(
        "id, user_id, status, attestation_uid, lock_address, transaction_hash",
      )
      .eq("id", renewalAttemptId)
      .eq("user_id", privy.id)
      .maybeSingle();

    if (attemptError) {
      log.error("Failed to fetch renewal attempt for attestation commit", {
        renewalAttemptId,
        userId: privy.id,
        error: attemptError,
      });
      return res.status(500).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Failed to verify renewal attempt",
      });
    }

    if (!attempt) {
      return res.status(404).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Renewal attempt not found",
      });
    }

    if (attempt.status !== "success") {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Renewal attempt is not successful",
      });
    }

    // Idempotency: if an attestation UID already exists, don't resubmit.
    if (attempt.attestation_uid) {
      return res.status(200).json({
        success: true,
        attestationUid: attempt.attestation_uid,
        attestationScanUrl: await buildEasScanLink(attempt.attestation_uid),
      });
    }

    if (!attestationSignature) {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Attestation signature is required",
      });
    }

    const decoded = await decodeAttestationDataFromDb({
      supabase,
      schemaKey: "xp_renewal",
      network: getDefaultNetworkName(),
      encodedData: attestationSignature.data,
    });

    if (!decoded) {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Invalid attestation payload",
      });
    }

    const decodedTxHash = normalizeBytes32(
      getDecodedFieldValue(decoded, "renewalTxHash"),
    );
    const decodedLockAddressRaw = getDecodedFieldValue(
      decoded,
      "subscriptionLockAddress",
    );
    const decodedLockAddress =
      typeof decodedLockAddressRaw === "string"
        ? decodedLockAddressRaw.toLowerCase()
        : null;

    const expectedTxHash = normalizeBytes32((attempt as any)?.transaction_hash);
    const expectedLockAddress =
      typeof (attempt as any)?.lock_address === "string"
        ? ((attempt as any).lock_address as string).toLowerCase()
        : null;

    if (!expectedTxHash || !expectedLockAddress) {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Renewal details not recorded for verification",
      });
    }

    if (!decodedTxHash || decodedTxHash !== expectedTxHash) {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Attestation payload does not match renewal transaction",
      });
    }

    if (!decodedLockAddress || decodedLockAddress !== expectedLockAddress) {
      return res.status(400).json({
        success: false,
        attestationUid: null,
        attestationScanUrl: null,
        error: "Attestation payload does not match subscription lock",
      });
    }

    const attestationResult = await handleGaslessAttestation({
      signature: attestationSignature,
      schemaKey: "xp_renewal",
      recipient,
      gracefulDegrade: true,
    });

    if (!attestationResult.success || !attestationResult.uid) {
      return res.status(200).json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
      });
    }

    const uid = attestationResult.uid;
    const scanUrl = await buildEasScanLink(uid);

    const { error: updateError } = await supabase
      .from("subscription_renewal_attempts")
      .update({ attestation_uid: uid })
      .eq("id", renewalAttemptId)
      .eq("user_id", privy.id);

    if (updateError) {
      log.error("Failed to persist renewal attestation UID", {
        renewalAttemptId,
        userId: privy.id,
        uid,
        error: updateError,
      });
    }

    return res.status(200).json({
      success: true,
      attestationUid: uid,
      attestationScanUrl: scanUrl,
    });
  } catch (error: any) {
    log.error("commit renewal attestation error", { error });
    return res.status(500).json({
      success: false,
      attestationUid: null,
      attestationScanUrl: null,
      error: "Internal server error",
    });
  }
}
