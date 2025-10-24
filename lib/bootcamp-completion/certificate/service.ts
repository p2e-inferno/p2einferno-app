import { getLogger } from "@/lib/utils/logger";
import { createAdminClient } from "@/lib/supabase/server";
import {
  checkUserKeyOwnership,
  grantKeyToUser,
} from "@/lib/services/user-key-service";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import type { CertificateClaimParams, CertificateClaimResult } from "./types";

const log = getLogger("bootcamp-completion:certificate");

export class CertificateService {
  /**
   * Claim a bootcamp certificate by granting a program-level key.
   * This method uses a lightweight locking pattern on the enrollment row to avoid duplicates.
   * Attestation is optional and handled separately by the client (pending in this MVP).
   */
  async claimCertificate(
    params: CertificateClaimParams,
  ): Promise<CertificateClaimResult> {
    const { enrollmentId, userId, cohortId, lockAddress } = params;

    try {
      const start = Date.now();
      log.info("certificate_claim_started", {
        enrollmentId,
        userId,
        cohortId,
        lockAddress,
      });
      // 1) Acquire claim lock (TTL semantics via updated_at)
      const lock = await this.acquireClaimLock(enrollmentId);
      if (lock.alreadyIssued) {
        return { success: true, alreadyIssued: true };
      }
      if (lock.inProgress) {
        return {
          success: false,
          inProgress: true,
          error: "Claim already in progress",
        };
      }

      // 2) Idempotent pre-check: see if user already has a key
      try {
        const publicClient = createPublicClientUnified();
        const keyCheck = await checkUserKeyOwnership(
          publicClient,
          userId,
          lockAddress,
        );
        if (keyCheck?.hasValidKey) {
          log.info("certificate_claim_preexisting_key", {
            enrollmentId,
            userId,
            cohortId,
            lockAddress,
          });
          // Do not mark as issued; we did not issue. UI can show "already have certificate".
          return {
            success: true,
            alreadyHasKey: true,
            attestationUid: null,
            attestationPending: false,
          };
        }
      } catch (e) {
        log.warn(
          "Key existence pre-check failed; proceeding with grant attempt",
          {
            enrollmentId,
            cohortId,
            lockAddress,
            error: e instanceof Error ? e.message : String(e),
          },
        );
      }

      // 3) Grant the key (server-side admin wallet)
      const walletClient = createWalletClientUnified();
      if (!walletClient) {
        await this.recordError(
          enrollmentId,
          "grant",
          "Server wallet not configured",
        );
        return { success: false, error: "Server wallet not configured" };
      }

      const publicClient = createPublicClientUnified();
      const grantRes = await grantKeyToUser(
        walletClient,
        publicClient,
        userId,
        lockAddress,
      );
      if (!grantRes.success) {
        await this.recordError(
          enrollmentId,
          "grant",
          grantRes.error || "Grant failed",
        );
        return { success: false, error: grantRes.error || "Key grant failed" };
      }

      const txHash = grantRes.transactionHash || "";

      // 4) Attestation: optional, handled client-side in this codebase
      // Mark as pending so UI can surface a retry path
      await this.markCertificateIssued({
        enrollmentId,
        txHash,
        attestationUid: null,
        error: "Attestation pending - retry available",
      });

      log.info("certificate_claim_succeeded", {
        enrollmentId,
        userId,
        cohortId,
        lockAddress,
        txHash,
        durationMs: Date.now() - start,
      });
      return {
        success: true,
        txHash,
        attestationUid: null,
        attestationPending: true,
      };
    } catch (error: any) {
      log.error("certificate_claim_failed", {
        enrollmentId,
        cohortId,
        error: error?.message || error,
      });
      return { success: false, error: error?.message || "Internal error" };
    } finally {
      // Always release lock
      try {
        await this.releaseClaimLock(enrollmentId);
      } catch (e) {
        log.warn("Failed to release claim lock", { enrollmentId, error: e });
      }
    }
  }

  private async acquireClaimLock(enrollmentId: string): Promise<{
    locked?: boolean;
    inProgress?: boolean;
    alreadyIssued?: boolean;
  }> {
    const supabase = createAdminClient();
    const { data: enroll, error } = await supabase
      .from("bootcamp_enrollments")
      .select(
        "id, certificate_issued, certificate_claim_in_progress, updated_at",
      )
      .eq("id", enrollmentId)
      .single();
    if (error || !enroll) {
      throw new Error("Enrollment not found");
    }
    if (enroll.certificate_issued) {
      return { alreadyIssued: true };
    }

    // Respect in-progress flag only if updated within 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (
      enroll.certificate_claim_in_progress &&
      enroll.updated_at &&
      new Date(enroll.updated_at) > fiveMinutesAgo
    ) {
      return { inProgress: true };
    }

    // Acquire lock
    const { error: upErr } = await supabase
      .from("bootcamp_enrollments")
      .update({ certificate_claim_in_progress: true })
      .eq("id", enrollmentId);
    if (upErr) throw upErr;
    return { locked: true };
  }

  private async releaseClaimLock(enrollmentId: string) {
    const supabase = createAdminClient();
    await supabase
      .from("bootcamp_enrollments")
      .update({ certificate_claim_in_progress: false })
      .eq("id", enrollmentId);
  }

  private async markCertificateIssued(params: {
    enrollmentId: string;
    txHash: string;
    attestationUid: string | null;
    error: string | null;
  }) {
    const { enrollmentId, txHash, attestationUid, error } = params;
    const supabase = createAdminClient();
    const { error: upErr } = await supabase
      .from("bootcamp_enrollments")
      .update({
        certificate_issued: true,
        certificate_issued_at: new Date().toISOString(),
        certificate_tx_hash: txHash || null,
        certificate_attestation_uid: attestationUid,
        certificate_last_error: error,
        certificate_last_error_at: error ? new Date().toISOString() : null,
        certificate_claim_in_progress: false,
      })
      .eq("id", enrollmentId);
    if (upErr) throw upErr;
  }

  private async recordError(
    enrollmentId: string,
    step: string,
    message: string,
  ) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("bootcamp_enrollments")
      .update({
        certificate_last_error: `${step}: ${message}`,
        certificate_last_error_at: new Date().toISOString(),
        // Supabase doesn't support sql expressions here; do a best-effort increment
      })
      .eq("id", enrollmentId);
    if (error) {
      log.warn("Failed to record certificate error", {
        enrollmentId,
        step,
        message,
        error,
      });
    }
    try {
      await supabase.rpc("increment_certificate_retry_count", {
        p_enrollment_id: enrollmentId,
      });
    } catch (e: any) {
      log.warn("retry_count_increment_failed", {
        enrollmentId,
        error: e?.message || String(e),
      });
    }
  }
}
