import type { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:certificate-commit-attestation");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== "true") {
    return res.status(403).json({ error: "Certificate feature not enabled" });
  }

  try {
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { cohortId, attestationUid } = req.body as {
      cohortId?: string;
      attestationUid?: string;
    };
    if (!cohortId || !attestationUid) {
      return res
        .status(400)
        .json({ error: "cohortId and attestationUid required" });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("bootcamp_enrollments")
      .select(
        `
        id,
        certificate_issued,
        certificate_attestation_uid,
        user_profiles:user_profile_id ( privy_user_id )
      `,
      )
      .eq("cohort_id", cohortId)
      .maybeSingle();
    if (error || !data) {
      return res.status(404).json({ error: "Enrollment not found" });
    }
    type EnrollmentCommitRow = {
      id: string;
      certificate_issued: boolean;
      certificate_attestation_uid: string | null;
      user_profiles: { privy_user_id: string } | null;
    };
    const row = data as unknown as EnrollmentCommitRow;
    const profile = row?.user_profiles;
    if (!profile || profile.privy_user_id !== user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!row.certificate_issued) {
      return res.status(400).json({ error: "No certificate found to attest" });
    }

    const { error: upErr } = await supabase
      .from("bootcamp_enrollments")
      .update({
        certificate_attestation_uid: attestationUid,
        certificate_last_error: null,
        certificate_last_error_at: null,
      })
      .eq("id", row.id);
    if (upErr) {
      log.error("Failed to save attestation UID", { upErr });
      return res.status(500).json({ error: "Failed to save attestation UID" });
    }
    return res.status(200).json({ success: true, attestationUid });
  } catch (error: any) {
    log.error("Commit attestation error", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
