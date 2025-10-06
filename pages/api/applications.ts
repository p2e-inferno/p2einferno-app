import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:applications");

const supabase = createAdminClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const applicationData = req.body;

    // Get authorization token
    const privyUser = await getPrivyUser(req);
    const privyUserId = privyUser?.id;
    let userProfileId: string | null = null;

    if (privyUserId) {
      try {
        // Get user profile
        const { data: userProfile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("privy_user_id", privyUserId)
          .single();

        userProfileId = userProfile?.id || null;
      } catch (error) {
        log.info(
          "Auth token verification failed, proceeding without user link",
        );
      }
    }
    log.info("privyUserId", userProfileId);

    // Validate required fields
    const requiredFields = [
      "cohort_id",
      "user_email",
      "user_name",
      // phone_number is optional - "0" placeholder is used for empty values
      "experience_level",
      "motivation",
      "goals",
    ];

    for (const field of requiredFields) {
      if (!applicationData[field]) {
        return res.status(400).json({
          error: `Missing required field: ${field}`,
        });
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(applicationData.user_email)) {
      return res.status(400).json({
        error: "Invalid email format",
      });
    }

    // Guard: Prevent duplicate/invalid applications before insert
    // 1) Fetch cohort to determine bootcamp_program_id
    const { data: targetCohort, error: cohortFetchError } = await supabase
      .from("cohorts")
      .select("id, bootcamp_program_id")
      .eq("id", applicationData.cohort_id)
      .single();

    if (cohortFetchError || !targetCohort) {
      log.error(
        "Failed to fetch target cohort for application",
        cohortFetchError,
      );
      return res.status(400).json({
        error: "Invalid cohort specified",
      });
    }

    // 2) If we have a linked user profile, block applications when already enrolled in any cohort of the same bootcamp
    if (userProfileId) {
      // Fetch user's enrollments with cohort relationship to get bootcamp_program_id
      const { data: userEnrollments, error: enrollErr } = await supabase
        .from("bootcamp_enrollments")
        .select("id, cohort:cohort_id ( id, bootcamp_program_id )")
        .eq("user_profile_id", userProfileId);

      if (enrollErr) {
        log.error("Error checking existing enrollments", enrollErr);
        return res
          .status(500)
          .json({ error: "Failed to validate enrollment status" });
      }

      const enrolledInBootcamp = (userEnrollments || []).some((en) => {
        const cohort = Array.isArray((en as any).cohort)
          ? (en as any).cohort[0]
          : (en as any).cohort;
        return cohort?.bootcamp_program_id === targetCohort.bootcamp_program_id;
      });

      if (enrolledInBootcamp) {
        return res.status(409).json({
          error:
            "You are already enrolled in this bootcamp and cannot apply to another cohort at this time.",
        });
      }
    }

    // 3) Prevent duplicate applications for the same cohort by the same user (profile_id preferred, fallback to email)
    if (userProfileId) {
      const { data: existingByProfile } = await supabase
        .from("applications")
        .select("id")
        .eq("cohort_id", applicationData.cohort_id)
        .eq("user_profile_id", userProfileId)
        .in("payment_status", ["pending", "completed"])
        .limit(1)
        .maybeSingle();

      if (existingByProfile) {
        return res.status(409).json({
          error: "You already have an application for this cohort.",
        });
      }
    } else {
      const { data: existingByEmail } = await supabase
        .from("applications")
        .select("id")
        .eq("cohort_id", applicationData.cohort_id)
        .eq("user_email", applicationData.user_email)
        .in("payment_status", ["pending", "completed"])
        .limit(1)
        .maybeSingle();

      if (existingByEmail) {
        return res.status(409).json({
          error: "You already have an application for this cohort.",
        });
      }
    }

    // Set default values for application
    const completeApplicationData = {
      ...applicationData,
      payment_status: "pending",
      application_status: "draft",
      payment_method: applicationData.payment_method || "fiat",
      user_profile_id: userProfileId, // Add direct relationship
    };

    const { data, error } = await supabase
      .from("applications")
      .insert([completeApplicationData])
      .select("id")
      .single();

    if (error) {
      log.error("Supabase error:", error);
      return res.status(500).json({
        error: "Failed to save application. Please try again.",
      });
    }

    // If we have a user profile ID, create the link
    if (userProfileId && data?.id) {
      await supabase.from("user_application_status").insert([
        {
          user_profile_id: userProfileId,
          application_id: data.id,
          status: "pending",
        },
      ]);
    }

    res.status(201).json({
      success: true,
      data: {
        applicationId: data.id,
      },
      message: "Application saved successfully",
    });
  } catch (error) {
    log.error("Unexpected error:", error);
    res.status(500).json({
      error: "An unexpected error occurred. Please try again.",
    });
  }
}
