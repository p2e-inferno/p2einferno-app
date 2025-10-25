import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";
import type { CertificateData } from "@/components/bootcamp/CertificateTemplate";
import { getLogger } from "@/lib/utils/logger";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { CertificateImageService } from "@/lib/bootcamp-completion/certificate/image-service";
import { resolveBlockchainIdentity } from "@/lib/blockchain/services/identity-resolver";
import type { Address } from "viem";

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

  // Check blockchain: does user have the NFT certificate?
  let hasKey = false;
  const userAddress =
    "wallet" in user ? user.wallet?.address : undefined;

  if (userAddress && program.lock_address) {
    try {
      const client = createPublicClientUnified();
      const result = await client.readContract({
        address: program.lock_address as Address,
        abi: COMPLETE_LOCK_ABI,
        functionName: "getHasValidKey",
        args: [userAddress as Address],
      });
      hasKey = Boolean(result);
      log.info("Blockchain verification complete", {
        userAddress,
        lockAddress: program.lock_address,
        hasKey,
      });
    } catch (error) {
      log.error("Failed to verify blockchain key", {
        error,
        userAddress,
        lockAddress: program.lock_address,
      });
      // Continue without blockchain verification - will return preview only
    }
  }

  // Check for stored certificate image URL (regardless of blockchain verification)
  const storedImageUrl = await CertificateImageService.getCertificateImage(
    enrollmentRow.id,
  );

  // If user has NFT and we have stored image, return it
  if (hasKey && storedImageUrl) {
    log.info("Returning stored certificate image for verified user", {
      enrollmentId: enrollmentRow.id,
      storedImageUrl,
    });
    return NextResponse.json({
      success: true,
      storedImageUrl,
      isClaimed: true,
      hasKey: true,
    });
  }

  // Resolve blockchain identity for certificate display
  // Priority: Basename > ENS > Full wallet address > display_name fallback
  let userName = profileData.display_name || "Anonymous User";

  if (userAddress) {
    try {
      const identity = await resolveBlockchainIdentity(userAddress);
      userName = identity.displayName;
      log.info("Blockchain identity resolved for certificate", {
        userAddress,
        displayName: identity.displayName,
        basename: identity.basename,
        ensName: identity.ensName,
        isFromCache: identity.isFromCache,
      });
    } catch (error) {
      log.warn("Failed to resolve blockchain identity, using display_name", {
        error,
        fallback: userName,
      });
    }
  }

  // Build certificate preview data for client-side generation
  const certificateData: CertificateData = {
    bootcampName: program.name,
    userName,
    completionDate:
      enrollmentRow.completion_date || new Date().toISOString(),
    lockAddress: program.lock_address,
  };

  log.info("Certificate data generated successfully", {
    bootcampName: program.name,
    userName,
    hasKey,
  });

  return NextResponse.json({
    success: true,
    data: certificateData,
    isCompleted: enrollmentRow.enrollment_status === "completed",
    hasKey,
    enrollmentId: enrollmentRow.id,
    storedImageUrl, // Always include stored image URL if it exists
  });
}
