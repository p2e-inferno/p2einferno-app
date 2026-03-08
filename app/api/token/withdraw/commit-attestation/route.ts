/**
 * POST /api/token/withdraw/commit-attestation
 *
 * Submits the delegated EAS attestation after the on-chain withdrawal tx succeeds.
 * Stores the resulting UID in dg_token_withdrawals.attestation_uid.
 *
 * This is a best-effort step: if attestation submission fails, the withdrawal remains completed.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getPrivyUserFromNextRequest,
  walletValidationErrorToHttpStatus,
} from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
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
  type DecodedField,
  getDecodedFieldValue,
  normalizeBytes32,
} from "@/lib/attestation/api/commit-guards";

const log = getLogger("api:token:withdraw:commit-attestation");

function getDecodedTxHashValue(decoded: DecodedField[]): unknown {
  const direct =
    getDecodedFieldValue(decoded, "withdrawalTxHash") ??
    getDecodedFieldValue(decoded, "withdrawal_tx_hash") ??
    getDecodedFieldValue(decoded, "txHash") ??
    getDecodedFieldValue(decoded, "transactionHash");
  if (direct !== undefined) return direct;

  const fuzzy = decoded.find((field) => {
    const name = String(field.name || "").toLowerCase();
    return (
      name.includes("hash") &&
      (name.includes("withdrawal") || name === "txhash")
    );
  });
  return fuzzy?.value;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { withdrawalId, attestationSignature } = (await req.json()) as {
      withdrawalId?: string;
      attestationSignature?: DelegatedAttestationSignature | null;
    };

    log.info("Withdrawal attestation commit requested", {
      userId: user.id,
      withdrawalId,
      hasSignature: Boolean(attestationSignature),
      signatureNetwork: attestationSignature?.network || null,
      signatureChainId: attestationSignature?.chainId || null,
    });

    if (!withdrawalId) {
      return NextResponse.json(
        { success: false, error: "withdrawalId is required" },
        { status: 400 },
      );
    }

    if (!isEASEnabled()) {
      return NextResponse.json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
      });
    }

    const supabase = createAdminClient();

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("dg_token_withdrawals")
      .select(
        "id, user_id, wallet_address, status, transaction_hash, attestation_uid",
      )
      .eq("id", withdrawalId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (withdrawalError) {
      log.error("Failed to fetch withdrawal for attestation commit", {
        withdrawalId,
        userId: user.id,
        error: withdrawalError,
      });
      return NextResponse.json(
        { success: false, error: "Failed to verify withdrawal" },
        { status: 500 },
      );
    }

    if (!withdrawal) {
      return NextResponse.json(
        { success: false, error: "Withdrawal not found" },
        { status: 404 },
      );
    }

    if (withdrawal.status !== "completed" || !withdrawal.transaction_hash) {
      return NextResponse.json(
        { success: false, error: "Withdrawal not completed yet" },
        { status: 400 },
      );
    }

    // Idempotency: if UID already exists, return it without resubmitting.
    if (withdrawal.attestation_uid) {
      log.info("Withdrawal attestation already exists (idempotent)", {
        userId: user.id,
        withdrawalId,
        attestationUid: withdrawal.attestation_uid,
      });
      return NextResponse.json({
        success: true,
        attestationUid: withdrawal.attestation_uid,
        attestationScanUrl: await buildEasScanLink(withdrawal.attestation_uid),
      });
    }

    if (!attestationSignature) {
      return NextResponse.json(
        { success: false, error: "Attestation signature is required" },
        { status: 400 },
      );
    }

    // Extract and validate wallet from attestation signature
    let userWallet: string;
    try {
      const extractedWallet = await extractAndValidateWalletFromSignature({
        userId: user.id,
        attestationSignature,
        context: "dg-withdrawal-commit",
      });

      if (!extractedWallet) {
        return NextResponse.json(
          { success: false, error: "Failed to extract wallet from signature" },
          { status: 400 },
        );
      }

      userWallet = extractedWallet;
    } catch (walletErr: unknown) {
      const status = walletValidationErrorToHttpStatus(walletErr);
      const safeStatus = status === 500 ? 403 : status;
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Wallet validation failed";
      return NextResponse.json(
        { success: false, error: message },
        { status: safeStatus },
      );
    }

    // Validate extracted wallet matches the withdrawal's wallet address
    const expectedWallet = withdrawal.wallet_address;
    if (
      !expectedWallet ||
      userWallet.toLowerCase() !== expectedWallet.toLowerCase()
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Attestation wallet does not match withdrawal wallet",
        },
        { status: 400 },
      );
    }

    const networkForDecode =
      attestationSignature.network?.toLowerCase() || getDefaultNetworkName();

    const decoded = await decodeAttestationDataFromDb({
      supabase,
      schemaKey: "dg_withdrawal",
      network: networkForDecode,
      encodedData: attestationSignature.data,
    });

    if (!decoded) {
      log.warn("Withdrawal attestation decode failed", {
        userId: user.id,
        withdrawalId,
        schemaKey: "dg_withdrawal",
        networkForDecode,
        signatureSchemaUid: attestationSignature.schemaUid,
      });
      return NextResponse.json(
        { success: false, error: "Invalid attestation payload" },
        { status: 400 },
      );
    }

    const decodedTxHashRaw = getDecodedTxHashValue(decoded);
    const expectedTxHashRaw = withdrawal.transaction_hash;

    const decodedTxHash =
      normalizeBytes32(decodedTxHashRaw) ||
      (typeof decodedTxHashRaw === "string"
        ? decodedTxHashRaw.toLowerCase()
        : null);
    const expectedTxHash =
      normalizeBytes32(expectedTxHashRaw) ||
      (typeof expectedTxHashRaw === "string"
        ? expectedTxHashRaw.toLowerCase()
        : null);

    if (!decodedTxHash || !expectedTxHash) {
      log.warn("Withdrawal commit missing tx hash for verification", {
        userId: user.id,
        withdrawalId,
        decodedTxHash,
        expectedTxHash,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Withdrawal transaction hash missing for verification",
        },
        { status: 400 },
      );
    }

    if (decodedTxHash !== expectedTxHash) {
      log.warn("Withdrawal attestation payload mismatch", {
        userId: user.id,
        withdrawalId,
        decodedTxHash,
        expectedTxHash,
      });
      return NextResponse.json(
        {
          success: false,
          error: "Attestation payload does not match withdrawal transaction",
        },
        { status: 400 },
      );
    }

    const attestationResult = await handleGaslessAttestation({
      signature: attestationSignature,
      schemaKey: "dg_withdrawal",
      recipient: userWallet,
      gracefulDegrade: true,
    });

    if (!attestationResult.success || !attestationResult.uid) {
      log.error("Withdrawal attestation submission failed", {
        userId: user.id,
        withdrawalId,
        error: attestationResult.error || "unknown",
      });
      return NextResponse.json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
        attestationError:
          attestationResult.error || "Attestation submission failed",
      });
    }

    const uid = attestationResult.uid;
    const scanUrl = await buildEasScanLink(uid);

    const { error: updateError } = await supabase
      .from("dg_token_withdrawals")
      .update({ attestation_uid: uid })
      .eq("id", withdrawalId)
      .eq("user_id", user.id);

    if (updateError) {
      log.error("Failed to persist withdrawal attestation UID", {
        withdrawalId,
        userId: user.id,
        uid,
        error: updateError,
      });
    }

    return NextResponse.json({
      success: true,
      attestationUid: uid,
      attestationScanUrl: scanUrl,
    });
  } catch (error: any) {
    log.error("commit withdrawal attestation error", { error });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
