import type { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { CertificateService } from "@/lib/bootcamp-completion/certificate/service";
import { rateLimiter } from "@/lib/utils/rate-limiter";

const log = getLogger("api:certificate-claim");

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

    const { cohortId } = req.body as { cohortId?: string };
    if (!cohortId) {
      return res.status(400).json({ error: "cohortId required" });
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

    // Fetch enrollment with joins to get lock address
    const { data, error } = await supabase
      .from("bootcamp_enrollments")
      .select(
        `
        id,
        enrollment_status,
        certificate_issued,
        user_profile_id,
        user_profiles:user_profile_id ( id, wallet_address, privy_user_id ),
        cohorts:cohort_id ( id, bootcamp_program_id ),
        bootcamp_programs:cohorts.bootcamp_program_id ( id, lock_address )
      `,
      )
      .eq("cohort_id", cohortId)
      .limit(1)
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
      user_profile_id: string;
      user_profiles: {
        id: string;
        wallet_address: string | null;
        privy_user_id: string;
      } | null;
      cohorts: { id: string; bootcamp_program_id: string } | null;
      bootcamp_programs: { id: string; lock_address: string | null } | null;
    };
    const row = data as unknown as EnrollmentWithRelations;
    const profile = row?.user_profiles;
    if (!profile || profile.privy_user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (row.enrollment_status !== "completed") {
      return res.status(403).json({ error: "Not eligible for certificate" });
    }

    const program = row?.bootcamp_programs;
    const lockAddress: string | undefined = program?.lock_address || undefined;
    if (!lockAddress) {
      return res.status(400).json({
        error:
          "Certificate not configured yet - please try again later or contact support",
      });
    }

    const service = new CertificateService();
    const result = await service.claimCertificate({
      enrollmentId: row.id,
      userId: profile.privy_user_id,
      userAddress: profile.wallet_address || "",
      cohortId,
      lockAddress,
    });

    if (!result.success) {
      const status = result.inProgress ? 409 : 500;
      return res.status(status).json(result);
    }

    // Do not call revalidateTag from pages API (no-op in many setups)
    return res.status(200).json(result);
  } catch (error: any) {
    log.error("Certificate claim failed", { error: error?.message || error });
    return res
      .status(500)
      .json({ error: "Internal server error", details: error?.message });
  }
}
