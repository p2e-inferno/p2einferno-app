import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";

export async function GET(req: NextRequest, { params }: { params: { cohortId: string } }) {
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

  const cohortId = params.cohortId;
  const supabase = createAdminClient();

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
      user_profiles:user_profile_id ( privy_user_id ),
      cohorts:cohort_id ( bootcamp_program_id ),
      bootcamp_programs:cohorts.bootcamp_program_id ( lock_address )
    `,
    )
    .eq("cohort_id", cohortId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const profile = (data as any).user_profiles;
  if (!profile || profile.privy_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const program = (data as any).bootcamp_programs;
  return NextResponse.json({
    isCompleted: data.enrollment_status === "completed",
    completionDate: data.completion_date,
    certificate: {
      issued: !!data.certificate_issued,
      issuedAt: data.certificate_issued_at,
      txHash: data.certificate_tx_hash || null,
      attestationUid: data.certificate_attestation_uid || null,
      lastError: data.certificate_last_error || null,
      canRetryAttestation: !!data.certificate_issued && !data.certificate_attestation_uid,
    },
    lockAddress: program?.lock_address || null,
  });
}

