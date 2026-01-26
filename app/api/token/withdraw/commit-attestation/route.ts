/**
 * POST /api/token/withdraw/commit-attestation
 *
 * Submits the delegated EAS attestation after the on-chain withdrawal tx succeeds.
 * Stores the resulting UID in dg_token_withdrawals.attestation_uid.
 *
 * This is a best-effort step: if attestation submission fails, the withdrawal remains completed.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import type { DelegatedAttestationSignature } from "@/lib/attestation/api/types";
import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";
import { buildEasScanLink } from "@/lib/attestation/core/network-config";

const log = getLogger("api:token:withdraw:commit-attestation");

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

    const recipient = withdrawal.wallet_address;

    const attestationResult = await handleGaslessAttestation({
      signature: attestationSignature,
      schemaKey: "dg_withdrawal",
      recipient,
      gracefulDegrade: true,
    });

    if (!attestationResult.success || !attestationResult.uid) {
      return NextResponse.json({
        success: true,
        attestationUid: null,
        attestationScanUrl: null,
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
