import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:bootcamps:[id]");

interface BootcampWithCohorts {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  max_reward_dgt: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
  enrolled_in_bootcamp?: boolean;
  enrolled_cohort_id?: string;
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
  }[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<BootcampWithCohorts>>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid bootcamp ID",
    });
  }

  try {
    const supabase = createAdminClient();
    // Resolve user profile (optional)
    let userProfileId: string | null = null;
    try {
      const user = await getPrivyUser(req);
      if (user?.id) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("privy_user_id", user.id)
          .single();
        userProfileId = profile?.id || null;
      }
    } catch {
      // unauthenticated is fine; continue without enrollment flags
    }
    // Fetch bootcamp details
    const { data: bootcampData, error: bootcampError } = await supabase
      .from("bootcamp_programs")
      .select("*")
      .eq("id", id)
      .single();

    if (bootcampError) {
      throw new Error(`Failed to fetch bootcamp: ${bootcampError.message}`);
    }

    if (!bootcampData) {
      return res.status(404).json({
        success: false,
        error: "Bootcamp not found",
      });
    }

    // Fetch cohorts for this bootcamp
    const { data: cohortsData, error: cohortsError } = await supabase
      .from("cohorts")
      .select(
        `
        id,
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
      .eq("bootcamp_program_id", id)
      .order("start_date", { ascending: false });

    if (cohortsError) {
      throw new Error(`Failed to fetch cohorts: ${cohortsError.message}`);
    }

    let enrolledInBootcamp = false;
    let enrolledCohortId: string | undefined = undefined;

    if (userProfileId && Array.isArray(cohortsData) && cohortsData.length) {
      const { data: enrollments } = await supabase
        .from("bootcamp_enrollments")
        .select("id, cohort_id")
        .eq("user_profile_id", userProfileId);

      const ids = new Set((enrollments || []).map((e: any) => e.cohort_id));
      const match = (cohortsData || []).find((c: any) => ids.has(c.id));
      enrolledInBootcamp = !!match;
      enrolledCohortId = match?.id;
    }

    // Include cohort-level is_enrolled decoration for convenience
    const decoratedCohorts = (cohortsData || []).map((c: any) => ({
      ...c,
      is_enrolled: enrolledCohortId === c.id,
      user_enrollment_id: undefined as string | undefined,
    }));

    const bootcampWithCohorts: BootcampWithCohorts = {
      ...bootcampData,
      enrolled_in_bootcamp: enrolledInBootcamp,
      enrolled_cohort_id: enrolledCohortId,
      cohorts: decoratedCohorts,
    };

    res.status(200).json({
      success: true,
      data: bootcampWithCohorts,
    });
  } catch (error: any) {
    log.error("Error fetching bootcamp:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch bootcamp",
    });
  }
}
