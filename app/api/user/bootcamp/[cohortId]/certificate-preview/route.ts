import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";
import type { CertificateData } from "@/components/bootcamp/CertificateTemplate";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:bootcamp:[cohortId]:certificate-preview");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cohortId: string }> },
) {
  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== "true") {
    log.warn("Certificate feature disabled");
    return NextResponse.json(
      { error: "Certificate feature is not enabled" },
      { status: 503 },
    );
  }

  const user = await getPrivyUserFromNextRequest(req);
  if (!user?.id) {
    log.warn("Unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cohortId } = await params;
  log.info("Fetching certificate preview", { cohortId, userId: user.id });
  const supabase = createAdminClient();

  // Get user profile
  const { data: profileData, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, display_name")
    .eq("privy_user_id", user.id)
    .maybeSingle();

  if (profileError || !profileData) {
    log.error("User profile not found", { profileError, userId: user.id });
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 404 },
    );
  }

  // Get enrollment with bootcamp and cohort details
  const { data: enrollment, error: enrollmentError } = await supabase
    .from("bootcamp_enrollments")
    .select(
      `
      id,
      enrollment_status,
      completion_date,
      cohorts:cohort_id (
        id,
        name,
        bootcamp_program_id,
        bootcamp_programs:bootcamp_program_id (
          name,
          description,
          lock_address
        )
      )
    `,
    )
    .eq("cohort_id", cohortId)
    .eq("user_profile_id", profileData.id)
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    log.error("Enrollment not found", {
      enrollmentError,
      cohortId,
      userProfileId: profileData.id,
    });
    return NextResponse.json(
      { error: "Enrollment not found" },
      { status: 404 },
    );
  }

  log.info("Enrollment found", { enrollmentId: enrollment.id });

  // Type the enrollment data
  type EnrollmentRow = {
    id: string;
    enrollment_status: string;
    completion_date: string | null;
    cohorts: {
      id: string;
      name: string;
      bootcamp_program_id: string;
      bootcamp_programs: {
        name: string;
        description: string;
        lock_address: string | null;
      } | null;
    } | null;
  };

  const enrollmentRow = enrollment as unknown as EnrollmentRow;
  const cohort = enrollmentRow.cohorts;
  const program = cohort?.bootcamp_programs;

  log.info("Parsed enrollment data", {
    hasCohort: !!cohort,
    hasProgram: !!program,
    lockAddress: program?.lock_address,
  });

  if (!cohort || !program) {
    log.error("Bootcamp data not found", { cohort, program });
    return NextResponse.json(
      { error: "Bootcamp data not found" },
      { status: 404 },
    );
  }

  // Check if lock address is configured
  if (!program.lock_address) {
    log.warn("Lock address not configured", { programName: program.name });
    return NextResponse.json(
      { error: "Certificate not configured - missing lock address" },
      { status: 400 },
    );
  }

  // Build certificate data
  const certificateData: CertificateData = {
    bootcampName: program.name,
    userName: profileData.display_name || "Anonymous User",
    completionDate:
      enrollmentRow.completion_date || new Date().toISOString(),
    lockAddress: program.lock_address,
  };

  log.info("Certificate data generated successfully", {
    bootcampName: program.name,
    userName: profileData.display_name,
  });

  return NextResponse.json({
    success: true,
    data: certificateData,
    isCompleted: enrollmentRow.enrollment_status === "completed",
  });
}
