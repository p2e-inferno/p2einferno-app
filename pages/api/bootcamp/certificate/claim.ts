import type { NextApiRequest, NextApiResponse } from "next";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
} from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { CertificateService } from "@/lib/bootcamp-completion/certificate/service";
import { rateLimiter } from "@/lib/utils/rate-limiter";
import type {
  DelegatedAttestationSignature,
  SchemaFieldData,
} from "@/lib/attestation/api/types";
import { isEASEnabled } from "@/lib/attestation/core/config";
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
} from "@/lib/attestation/api/commit-guards";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { extractTokenTransfers } from "@/lib/blockchain/shared/transaction-utils";

const log = getLogger("api:certificate-claim");
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

async function computeTotalEarnedRewards(params: {
  supabase: ReturnType<typeof createAdminClient>;
  userProfileId: string;
  cohortId: string;
}): Promise<number> {
  const { supabase, userProfileId, cohortId } = params;

  const { data: milestones, error: milestonesError } = await supabase
    .from("cohort_milestones")
    .select("id")
    .eq("cohort_id", cohortId);

  if (milestonesError) {
    throw new Error(`Failed to load milestones: ${milestonesError.message}`);
  }

  const milestoneIds = (milestones || []).map((m: any) => m.id);
  if (milestoneIds.length === 0) return 0;

  const { data: tasks, error: tasksError } = await supabase
    .from("milestone_tasks")
    .select("id, reward_amount")
    .in("milestone_id", milestoneIds);

  if (tasksError) {
    throw new Error(`Failed to load tasks: ${tasksError.message}`);
  }

  const taskRewards = new Map<string, number>();
  const taskIds: string[] = [];
  for (const t of tasks || []) {
    taskIds.push((t as any).id);
    taskRewards.set((t as any).id, Number((t as any).reward_amount || 0));
  }
  if (taskIds.length === 0) return 0;

  const { data: progress, error: progressError } = await supabase
    .from("user_task_progress")
    .select("task_id, reward_claimed")
    .eq("user_profile_id", userProfileId)
    .in("task_id", taskIds)
    .eq("reward_claimed", true);

  if (progressError) {
    throw new Error(`Failed to load claimed rewards: ${progressError.message}`);
  }

  let total = 0;
  for (const p of progress || []) {
    const taskId = (p as any).task_id as string;
    total += taskRewards.get(taskId) || 0;
  }
  return total;
}

function buildBootcampCompletionSchemaData(params: {
  cohortId: string;
  cohortName: string;
  bootcampId: string;
  bootcampTitle: string;
  userAddress: string;
  cohortLockAddress: string;
  certificateLockAddress: string;
  certificateTokenId: bigint;
  certificateTxHashBytes32: string;
  completionDateUnix: number;
  totalEarnedRewards: number;
}): SchemaFieldData[] {
  return [
    { name: "cohortId", type: "string", value: params.cohortId },
    { name: "cohortName", type: "string", value: params.cohortName },
    { name: "bootcampId", type: "string", value: params.bootcampId },
    { name: "bootcampTitle", type: "string", value: params.bootcampTitle },
    { name: "userAddress", type: "address", value: params.userAddress },
    {
      name: "cohortLockAddress",
      type: "address",
      value: params.cohortLockAddress,
    },
    {
      name: "certificateLockAddress",
      type: "address",
      value: params.certificateLockAddress,
    },
    {
      name: "certificateTokenId",
      type: "uint256",
      value: params.certificateTokenId.toString(),
    },
    {
      name: "certificateTxHash",
      type: "bytes32",
      value: params.certificateTxHashBytes32,
    },
    {
      name: "completionDate",
      type: "uint256",
      value: String(params.completionDateUnix),
    },
    {
      name: "totalXpEarned",
      type: "uint256",
      value: String(params.totalEarnedRewards),
    },
  ];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Feature flag
  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== "true") {
    return res.status(403).json({ error: "Certificate feature not enabled" });
  }

  try {
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { cohortId, attestationSignature } = req.body as {
      cohortId?: string;
      attestationSignature?: DelegatedAttestationSignature | null;
    };
    if (!cohortId) {
      return res.status(400).json({ error: "cohortId required" });
    }

    // For initial grant path (no attestationSignature), validate X-Active-Wallet header early
    // This fails fast before expensive DB queries if header is missing
    if (!attestationSignature) {
      const activeWalletHeader = req.headers["x-active-wallet"];
      if (!activeWalletHeader) {
        return res.status(400).json({
          error: "X-Active-Wallet header is required",
        });
      }
    }

    // Rate limiting: per-user per-cohort, configurable
    const perUserLimit = Number(process.env.CLAIM_RATE_LIMIT_PER_USER || 3);
    if (perUserLimit > 0) {
      const id = `claim:${user.id}:${cohortId}`;
      const rl = await rateLimiter.check(id, perUserLimit, 60_000);
      if (!rl.success) {
        return res.status(429).json({
          error: "Too many claim attempts. Please wait before trying again.",
          retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
        });
      }
    }

    // Optional global limit (configurable; defaults high)
    const globalHourly = Number(
      process.env.CLAIM_RATE_LIMIT_GLOBAL_HOURLY || 0,
    );
    if (globalHourly > 0) {
      const rl = await rateLimiter.check(
        "claim:global",
        globalHourly,
        3_600_000,
      );
      if (!rl.success) {
        log.warn("Global claim rate limit exceeded", {
          resetAt: rl.resetAt,
          userId: user.id,
          cohortId,
        });
        return res.status(503).json({
          error: "System is processing maximum claims. Please try again soon.",
          retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000),
        });
      }
    }

    const supabase = createAdminClient();

    // First, get the user_profile_id for the current privy user
    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("privy_user_id", user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      log.error("User profile fetch error", { profileError });
      return res.status(404).json({ error: "User profile not found" });
    }

    // Fetch enrollment with joins to get lock address
    const { data, error } = await supabase
      .from("bootcamp_enrollments")
      .select(
        `
        id,
        enrollment_status,
        certificate_issued,
        completion_date,
        certificate_tx_hash,
        certificate_attestation_uid,
        user_profile_id,
        user_profiles:user_profile_id ( id, privy_user_id ),
        cohorts:cohort_id (
          id,
          name,
          lock_address,
          bootcamp_program_id,
          bootcamp_programs:bootcamp_program_id ( id, name, lock_address )
        )
      `,
      )
      .eq("cohort_id", cohortId)
      .eq("user_profile_id", profileData.id)
      .maybeSingle();

    if (error) {
      log.error("Enrollment fetch error", { error });
      return res.status(500).json({ error: "Failed to load enrollment" });
    }
    if (!data) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    type EnrollmentWithRelations = {
      id: string;
      enrollment_status: string;
      certificate_issued: boolean;
      completion_date: string | null;
      certificate_tx_hash: string | null;
      certificate_attestation_uid: string | null;
      user_profile_id: string;
      user_profiles: {
        id: string;
        privy_user_id: string;
      } | null;
      cohorts: {
        id: string;
        name: string;
        lock_address: string | null;
        bootcamp_program_id: string;
        bootcamp_programs: {
          id: string;
          name: string;
          lock_address: string | null;
        } | null;
      } | null;
    };
    const row = data as unknown as EnrollmentWithRelations;
    const profile = row?.user_profiles;
    if (!profile || profile.privy_user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (row.enrollment_status !== "completed") {
      return res.status(403).json({ error: "Not eligible for certificate" });
    }

    // Get wallet address - extract from signature if commit path, otherwise from header or Privy
    let walletAddress: string | null = null;

    const program = row?.cohorts?.bootcamp_programs;
    const lockAddress: string | undefined = program?.lock_address || undefined;
    if (!lockAddress) {
      return res.status(400).json({
        error:
          "Certificate not configured yet - please try again later or contact support",
      });
    }

    const existingAttestationUid = row.certificate_attestation_uid;
    if (attestationSignature) {
      // Extract and validate wallet from attestation signature
      try {
        walletAddress = await extractAndValidateWalletFromSignature({
          userId: user.id,
          attestationSignature,
          context: "bootcamp-certificate-claim",
        });
      } catch (error: any) {
        const status = error.message?.includes("required") ? 400 : 403;
        return res.status(status).json({ error: error.message });
      }

      if (!row.certificate_issued) {
        return res
          .status(400)
          .json({ error: "No certificate found to attest" });
      }

      if (!isEASEnabled()) {
        return res.status(200).json({
          success: true,
          attestationUid: null,
          attestationScanUrl: null,
          attestationPending: false,
        });
      }

      if (existingAttestationUid) {
        return res.status(200).json({
          success: true,
          attestationUid: existingAttestationUid,
          attestationScanUrl: await buildEasScanLink(existingAttestationUid),
          attestationPending: false,
        });
      }

      const recipient = walletAddress || "";
      if (!recipient) {
        return res.status(400).json({ error: "Wallet not configured" });
      }

      log.debug("Bootcamp certificate attestation commit received", {
        enrollmentId: row.id,
        cohortId,
        userId: profile.privy_user_id,
        schemaKey: "bootcamp_completion",
        network: getDefaultNetworkName(),
        hasExistingUid: Boolean(existingAttestationUid),
      });

      const decoded = await decodeAttestationDataFromDb({
        supabase,
        schemaKey: "bootcamp_completion",
        network: getDefaultNetworkName(),
        encodedData: attestationSignature.data,
      });

      if (!decoded) {
        log.warn("Bootcamp certificate commit failed to decode payload", {
          enrollmentId: row.id,
          cohortId,
          userId: profile.privy_user_id,
          schemaKey: "bootcamp_completion",
          network: getDefaultNetworkName(),
        });
        return res.status(400).json({ error: "Invalid attestation payload" });
      }

      const decodedTxHashRaw = getDecodedFieldValue(
        decoded,
        "certificateTxHash",
      );
      const expectedTxHashRaw = row.certificate_tx_hash;

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
        log.warn(
          "Bootcamp certificate commit missing tx hash for verification",
          {
            enrollmentId: row.id,
            cohortId,
            userId: profile.privy_user_id,
            decodedTxHash: decodedTxHash || null,
            expectedTxHash: expectedTxHash || null,
          },
        );
        return res.status(400).json({
          error: "Certificate transaction hash missing for verification",
        });
      }

      if (decodedTxHash !== expectedTxHash) {
        log.warn("Bootcamp certificate commit payload mismatch", {
          enrollmentId: row.id,
          cohortId,
          userId: profile.privy_user_id,
          decodedTxHash,
          expectedTxHash,
        });
        return res.status(400).json({
          error: "Attestation payload does not match certificate transaction",
        });
      }

      const attestationResult = await handleGaslessAttestation({
        signature: attestationSignature,
        schemaKey: "bootcamp_completion",
        recipient,
        // On-chain grant already happened; do not block user on EAS failures.
        gracefulDegrade: true,
      });

      const uid = attestationResult.uid || null;
      const attestationScanUrl = uid ? await buildEasScanLink(uid) : null;

      if (uid) {
        const { error: upErr } = await supabase
          .from("bootcamp_enrollments")
          .update({
            certificate_attestation_uid: uid,
            certificate_last_error: null,
            certificate_last_error_at: null,
          })
          .eq("id", row.id);
        if (upErr) {
          log.error("Failed to persist certificate attestation UID", {
            enrollmentId: row.id,
            uid,
            error: upErr,
          });
        }
      }

      return res.status(200).json({
        success: true,
        attestationUid: uid,
        attestationScanUrl,
        attestationPending: !uid,
      });
    }

    // Initial claim path - get wallet from X-Active-Wallet header (REQUIRED)
    try {
      walletAddress = await extractAndValidateWalletFromHeader({
        userId: user.id,
        activeWalletHeader: req.headers["x-active-wallet"] as
          | string
          | undefined,
        context: "bootcamp-certificate-grant",
        required: true, // No fallback - client must send the header
      });
    } catch (error: any) {
      const status = error.message?.includes("required") ? 400 : 403;
      return res.status(status).json({ error: error.message });
    }

    if (!walletAddress) {
      return res.status(400).json({ error: "Wallet address is required" });
    }

    const service = new CertificateService();
    const result = await service.claimCertificate({
      enrollmentId: row.id,
      userId: profile.privy_user_id,
      userAddress: walletAddress,
      cohortId,
      lockAddress,
    });

    if (!result.success) {
      const status = result.inProgress ? 409 : 500;
      return res.status(status).json(result);
    }

    // If EAS is enabled and we don't yet have an attestation UID, return a payload to sign.
    // Client will POST back to this same endpoint with attestationSignature to commit it.
    if (isEASEnabled()) {
      // Refresh enrollment to capture tx hash/issued state set by the service
      const { data: fresh, error: freshError } = await supabase
        .from("bootcamp_enrollments")
        .select(
          `
          certificate_issued,
          certificate_tx_hash,
          certificate_attestation_uid,
          completion_date
        `,
        )
        .eq("id", row.id)
        .maybeSingle();

      if (freshError) {
        log.warn("Failed to refresh enrollment after claim", {
          enrollmentId: row.id,
          error: freshError,
        });
      }

      const freshUid = (fresh as any)?.certificate_attestation_uid as
        | string
        | null
        | undefined;

      if (freshUid) {
        return res.status(200).json({
          ...result,
          attestationUid: freshUid,
          attestationScanUrl: await buildEasScanLink(freshUid),
          attestationPending: false,
          attestationRequired: false,
        });
      }

      const recipient = walletAddress || "";
      const completionDateIso =
        (fresh as any)?.completion_date || row?.completion_date || null;
      const completionDateUnix = completionDateIso
        ? Math.floor(new Date(completionDateIso).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

      const certificateTxHashRaw =
        (fresh as any)?.certificate_tx_hash || (result as any)?.txHash || "";
      const certificateTxHashBytes32 =
        normalizeBytes32(certificateTxHashRaw) || ZERO_BYTES32;

      let totalEarnedRewards = 0;
      try {
        totalEarnedRewards = await computeTotalEarnedRewards({
          supabase,
          userProfileId: row.user_profile_id,
          cohortId,
        });
      } catch (e: any) {
        log.warn(
          "Failed to compute total earned rewards for certificate attestation",
          {
            enrollmentId: row.id,
            cohortId,
            error: e?.message || String(e),
          },
        );
      }

      const cohortName = row?.cohorts?.name || "";
      const bootcampId = row?.cohorts?.bootcamp_program_id || "";
      const bootcampTitle = program?.name || "";
      const cohortLockAddress = row?.cohorts?.lock_address || ZERO_ADDRESS;
      const certificateLockAddress = lockAddress;

      let certificateTokenId = 0n;
      try {
        const publicClient = createPublicClientUnified();
        const keyCheck = await checkUserKeyOwnership(
          publicClient,
          profile.privy_user_id,
          certificateLockAddress,
        );
        if (keyCheck?.hasValidKey && keyCheck.keyInfo?.tokenId != null) {
          certificateTokenId = keyCheck.keyInfo.tokenId;
        }
      } catch (e: any) {
        log.warn("Failed to load certificate tokenId via key ownership check", {
          enrollmentId: row.id,
          cohortId,
          lockAddress: certificateLockAddress,
          error: e?.message || String(e),
        });
      }

      if (
        certificateTokenId === 0n &&
        certificateTxHashBytes32 !== ZERO_BYTES32
      ) {
        try {
          const publicClient = createPublicClientUnified();
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: certificateTxHashBytes32 as `0x${string}`,
            confirmations: 1,
          });

          const transfers = extractTokenTransfers(receipt);
          const minted = transfers.find(
            (t) =>
              t.to.toLowerCase() === recipient.toLowerCase() &&
              t.from.toLowerCase() ===
                "0x0000000000000000000000000000000000000000",
          );
          if (minted) {
            certificateTokenId = minted.tokenId;
          }
        } catch (e: any) {
          log.warn("Failed to infer certificate tokenId from tx receipt", {
            enrollmentId: row.id,
            cohortId,
            txHash: certificateTxHashBytes32,
            error: e?.message || String(e),
          });
        }
      }

      const schemaData = buildBootcampCompletionSchemaData({
        cohortId,
        cohortName,
        bootcampId,
        bootcampTitle,
        userAddress: recipient,
        cohortLockAddress,
        certificateLockAddress,
        certificateTokenId,
        certificateTxHashBytes32,
        completionDateUnix,
        totalEarnedRewards,
      });

      return res.status(200).json({
        ...result,
        attestationUid: null,
        attestationPending: true,
        attestationRequired: true,
        attestationPayload: {
          schemaKey: "bootcamp_completion",
          recipient,
          schemaData,
        },
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    log.error("Certificate claim failed", { error: error?.message || error });
    return res
      .status(500)
      .json({ error: "Internal server error", details: error?.message });
  }
}
