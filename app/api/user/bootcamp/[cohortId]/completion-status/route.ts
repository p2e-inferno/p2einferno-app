import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";

export async function GET(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== "true") {
    return NextResponse.json({
      isCompleted: false,
      completionDate: null,
      certificate: {
        issued: false,
        issuedAt: null,
        txHash: null,
        attestationUid: null,
        lastError: null,
        canRetryAttestation: false,
      },
      lockAddress: null,
    });
  }

  const user = await getPrivyUserFromNextRequest(req);
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cohortId } = await params;
  const supabase = createAdminClient();

  // First, get the user_profile_id for the current privy user
  const { data: profileData, error: profileError } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("privy_user_id", user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  // Now query enrollment for this specific user and cohort
  const { data, error } = await supabase
    .from("bootcamp_enrollments")
    .select(
      `
      id,
      enrollment_status,
      completion_date,
      certificate_issued,
      certificate_issued_at,
      certificate_tx_hash,
      certificate_attestation_uid,
      certificate_last_error,
      cohorts:cohort_id (
        bootcamp_program_id,
        bootcamp_programs:bootcamp_program_id ( lock_address )
      )
    `,
    )
    .eq("cohort_id", cohortId)
    .eq("user_profile_id", profileData.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }
  type StatusRow = {
    id: string;
    enrollment_status: string;
    completion_date: string | null;
    certificate_issued: boolean;
    certificate_issued_at: string | null;
    certificate_tx_hash: string | null;
    certificate_attestation_uid: string | null;
    certificate_last_error: string | null;
    cohorts: {
      bootcamp_program_id: string;
      bootcamp_programs: { lock_address: string | null } | null;
    } | null;
  };
  const row = data as unknown as StatusRow;

  const program = row?.cohorts?.bootcamp_programs;
  return NextResponse.json({
    isCompleted: row.enrollment_status === "completed",
    completionDate: row.completion_date,
    certificate: {
      issued: !!row.certificate_issued,
      issuedAt: row.certificate_issued_at,
      txHash: row.certificate_tx_hash || null,
      attestationUid: row.certificate_attestation_uid || null,
      lastError: row.certificate_last_error || null,
      canRetryAttestation: !!row.certificate_issued && !row.certificate_attestation_uid,
    },
    lockAddress: program?.lock_address || null,
  });
}
