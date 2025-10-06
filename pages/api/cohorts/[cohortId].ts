import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getPrivyUser } from "@/lib/auth/privy";
import type {
  BootcampProgram,
  Cohort,
  CohortMilestone,
  MilestoneTask,
  ProgramHighlight,
  ProgramRequirement,
} from "@/lib/supabase/types";

const log = getLogger("api:cohorts:[cohortId]");

interface MilestoneWithTasks extends CohortMilestone {
  milestone_tasks: MilestoneTask[];
}

interface CohortDetailsResponse {
  bootcamp: BootcampProgram;
  cohort: Cohort;
  milestones: MilestoneWithTasks[];
  highlights: ProgramHighlight[];
  requirements: ProgramRequirement[];
  userEnrollment?: {
    isEnrolledInBootcamp: boolean;
    enrolledCohortId?: string;
  };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<CohortDetailsResponse>>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const { cohortId } = req.query;

  if (!cohortId || typeof cohortId !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid cohort ID",
    });
  }

  try {
    const supabase = createAdminClient();
    // Optional user context
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
      // Proceed unauthenticated
    }
    // Fetch cohort details first to get bootcamp_program_id
    const { data: cohortData, error: cohortError } = await supabase
      .from("cohorts")
      .select("*")
      .eq("id", cohortId)
      .single();

    if (cohortError) {
      throw new Error(`Failed to fetch cohort: ${cohortError.message}`);
    }

    if (!cohortData) {
      return res.status(404).json({
        success: false,
        error: "Cohort not found",
      });
    }

    // Fetch bootcamp details
    const { data: bootcampData, error: bootcampError } = await supabase
      .from("bootcamp_programs")
      .select("*")
      .eq("id", cohortData.bootcamp_program_id)
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

    // Fetch milestones with tasks
    const { data: milestonesData, error: milestonesError } = await supabase
      .from("cohort_milestones")
      .select(
        `
        *,
        milestone_tasks (*)
      `,
      )
      .eq("cohort_id", cohortId)
      .order("order_index", { ascending: true });

    if (milestonesError) {
      throw new Error(`Failed to fetch milestones: ${milestonesError.message}`);
    }

    // Fetch program highlights
    const { data: highlightsData, error: highlightsError } = await supabase
      .from("program_highlights")
      .select("*")
      .eq("cohort_id", cohortId)
      .order("order_index", { ascending: true });

    if (highlightsError) {
      throw new Error(`Failed to fetch highlights: ${highlightsError.message}`);
    }

    // Fetch program requirements
    const { data: requirementsData, error: requirementsError } = await supabase
      .from("program_requirements")
      .select("*")
      .eq("cohort_id", cohortId)
      .order("order_index", { ascending: true });

    if (requirementsError) {
      throw new Error(
        `Failed to fetch requirements: ${requirementsError.message}`,
      );
    }

    // User enrollment awareness (is enrolled in this bootcamp at large)
    let userEnrollment: CohortDetailsResponse["userEnrollment"] | undefined =
      undefined;
    if (userProfileId) {
      const { data: enrollments } = await supabase
        .from("bootcamp_enrollments")
        .select("id, cohort:cohort_id ( id, bootcamp_program_id )")
        .eq("user_profile_id", userProfileId);

      const match = (enrollments || []).find((en: any) => {
        const c = Array.isArray(en.cohort) ? en.cohort[0] : en.cohort;
        return c?.bootcamp_program_id === cohortData.bootcamp_program_id;
      });
      userEnrollment = {
        isEnrolledInBootcamp: !!match,
        enrolledCohortId: match
          ? (Array.isArray(match.cohort) ? match.cohort[0] : match.cohort)?.id
          : undefined,
      };
    }

    const response: CohortDetailsResponse = {
      bootcamp: bootcampData,
      cohort: cohortData,
      milestones: milestonesData || [],
      highlights: highlightsData || [],
      requirements: requirementsData || [],
      userEnrollment,
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    log.error("Error fetching cohort details:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch cohort details",
    });
  }
}
