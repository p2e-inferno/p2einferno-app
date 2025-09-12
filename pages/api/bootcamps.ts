import { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase/client";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/api";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:bootcamps");

interface BootcampWithCohorts {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  max_reward_dgt: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
  cohorts: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    max_participants: number;
    current_participants: number;
    registration_deadline: string;
    status: "open" | "closed" | "upcoming";
    usdt_amount?: number;
    naira_amount?: number;
    is_enrolled?: boolean;
    user_enrollment_id?: string;
  }[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<BootcampWithCohorts[]>>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    // Get user to check enrollment status
    let userProfileId: string | null = null;
    try {
      const user = await getPrivyUser(req);
      if (user?.id) {
        // Get user profile ID
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("privy_user_id", user.id)
          .single();
        userProfileId = profile?.id || null;
      }
    } catch {
      // User not authenticated, continue without enrollment status
    }

    // Fetch all bootcamp programs with their cohorts
    const { data: bootcamps, error: bootcampsError } = await supabase
      .from("bootcamp_programs")
      .select(
        `
        id,
        name,
        description,
        duration_weeks,
        max_reward_dgt,
        image_url,
        created_at,
        updated_at
      `,
      )
      .order("created_at", { ascending: false });

    if (bootcampsError) {
      throw new Error(`Failed to fetch bootcamps: ${bootcampsError.message}`);
    }

    // Fetch cohorts for all bootcamps
    const { data: cohorts, error: cohortsError } = await supabase
      .from("cohorts")
      .select(
        `
        id,
        bootcamp_program_id,
        name,
        start_date,
        end_date,
        max_participants,
        current_participants,
        registration_deadline,
        status,
        usdt_amount,
        naira_amount
      `,
      )
      .order("start_date", { ascending: false });

    if (cohortsError) {
      throw new Error(`Failed to fetch cohorts: ${cohortsError.message}`);
    }

    let userEnrollments: any[] = [];
    if (userProfileId) {
      // Fetch user's enrollments to check enrollment status
      const { data: enrollments } = await supabase
        .from("bootcamp_enrollments")
        .select("id, cohort_id")
        .eq("user_profile_id", userProfileId);

      userEnrollments = enrollments || [];
    }

    // Combine bootcamps with their cohorts and enrollment status
    const bootcampsWithCohorts: BootcampWithCohorts[] = (bootcamps || []).map(
      (bootcamp) => {
        const bootcampCohorts = (cohorts || [])
          .filter((cohort) => cohort.bootcamp_program_id === bootcamp.id)
          .map((cohort) => {
            // Check if user is enrolled in this cohort
            const enrollment = userEnrollments.find(
              (enrollment) => enrollment.cohort_id === cohort.id,
            );

            return {
              ...cohort,
              is_enrolled: !!enrollment,
              user_enrollment_id: enrollment?.id || undefined,
            };
          });

        return {
          ...bootcamp,
          cohorts: bootcampCohorts,
        };
      },
    );

    // Filter out bootcamps that have no cohorts (optional)
    // const bootcampsWithActiveCohorts = bootcampsWithCohorts.filter(
    //   (bootcamp) => bootcamp.cohorts.length > 0
    // );

    res.status(200).json({
      success: true,
      data: bootcampsWithCohorts,
    });
  } catch (error: any) {
    log.error("Error fetching bootcamps:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch bootcamps",
    });
  }
}
