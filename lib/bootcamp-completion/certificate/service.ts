import { getLogger } from "@/lib/utils/logger";
import { createAdminClient } from "@/lib/supabase/server";
import { UserKeyService } from "@/lib/services/user-key-service";
import type {
  CertificateClaimParams,
  CertificateClaimResult,
} from "./types";

const log = getLogger("bootcamp-completion:certificate");

export class CertificateService {
  /**
   * Claim a bootcamp certificate by granting a program-level key.
   * This method uses a lightweight locking pattern on the enrollment row to avoid duplicates.
   * Attestation is optional and handled separately by the client (pending in this MVP).
   */
  async claimCertificate(params: CertificateClaimParams): Promise<CertificateClaimResult> {
    const { enrollmentId, userId, cohortId, lockAddress } = params;
    const supabase = createAdminClient();

    try {
      // 1) Acquire claim lock (TTL semantics via updated_at)
      const lock = await this.acquireClaimLock(enrollmentId);
      if (lock.alreadyIssued) {
        return { success: true, alreadyIssued: true };
      }
      if (lock.inProgress) {
        return { success: false, inProgress: true, error: "Claim already in progress" };
      }

      // 2) Idempotent pre-check: see if user already has a key
      let preExistingTx: string | undefined;
      try {
        const keyCheck = await UserKeyService.checkUserKeyOwnership(userId, lockAddress);
        if (keyCheck?.hasValidKey) {
          // Simulate success path; we don't have a tx hash here (could be discovered via indexers later)
          preExistingTx = undefined;
          await this.markCertificateIssued({
            enrollmentId,
            txHash: preExistingTx ?? "",
            attestationUid: null,
            error: null,
          });
          return { success: true, txHash: preExistingTx, attestationUid: null, attestationPending: true };
        }
      } catch (e) {
        log.warn("Key existence pre-check failed; proceeding with grant attempt", {
          enrollmentId,
          cohortId,
          lockAddress,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 3) Grant the key (server-side admin wallet)
      const grantRes = await UserKeyService.grantKeyToUser(userId, lockAddress);
      if (!grantRes.success) {
        await this.recordError(enrollmentId, "grant", grantRes.error || "Grant failed");
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

      return { success: true, txHash, attestationUid: null, attestationPending: true };
    } catch (error: any) {
      log.error("Certificate claim failed", { enrollmentId, error: error?.message || error });
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

  private async acquireClaimLock(enrollmentId: string): Promise<{ locked?: boolean; inProgress?: boolean; alreadyIssued?: boolean }> {
    const supabase = createAdminClient();
    const { data: enroll, error } = await supabase
      .from("bootcamp_enrollments")
      .select("id, certificate_issued, certificate_claim_in_progress, updated_at")
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
    if (enroll.certificate_claim_in_progress && enroll.updated_at && new Date(enroll.updated_at) > fiveMinutesAgo) {
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

  private async recordError(enrollmentId: string, step: string, message: string) {
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
      log.warn("Failed to record certificate error", { enrollmentId, step, message, error });
    }
  }
}

