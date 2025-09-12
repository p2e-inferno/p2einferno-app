import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/api";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:enrollments");

interface EnrollmentWithDetails {
  id: string;
  enrollment_status: string;
  progress: {
    modules_completed: number;
    total_modules: number;
  };
  completion_date?: string;
  created_at: string;
  updated_at: string;
  cohort: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
    bootcamp_program: {
      id: string;
      name: string;
      description: string;
      duration_weeks: number;
      max_reward_dgt: number;
      image_url?: string;
    };
  };
  milestone_progress?: {
    total_milestones: number;
    completed_milestones: number;
    current_milestone?: {
      id: string;
      name: string;
      progress_percentage: number;
    };
  };
}

type RawEnrollment = {
  id: string;
  enrollment_status: string;
  progress: {
    modules_completed: number;
    total_modules: number;
  };
  completion_date?: string;
  created_at: string;
  updated_at: string;
  cohort: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: string;
    bootcamp_program: {
      id: string;
      name: string;
      description: string;
      duration_weeks: number;
      max_reward_dgt: number;
      image_url?: string;
    };
  };
};

type RawMilestoneProgress = {
  milestone_id: string;
  status: string;
  progress_percentage: number;
  milestone: {
    id: string;
    name: string;
    order_index: number;
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<EnrollmentWithDetails[]>>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const supabase = createAdminClient();
    // Get authenticated user
    const user = await getPrivyUser(req);
    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Get user profile with a brief retry to handle race conditions
    let profile: { id: string; privy_user_id: string } | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, privy_user_id")
        .eq("privy_user_id", user.id)
        .maybeSingle();
      if (data) {
        profile = data;
        break;
      }
      lastError = error;
      // tiny delay before retry
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!profile) {
      if (lastError) {
        log.error("[ENROLLMENTS] Profile lookup error:", lastError);
      }
      return res.status(404).json({
        success: false,
        error: "User profile not found",
      });
    }

    // Fetch user enrollments with cohort and bootcamp details
    const { data: enrollmentsData, error: enrollmentsError } = await supabase
      .from("bootcamp_enrollments")
      .select(
        `
        id,
        enrollment_status,
        progress,
        completion_date,
        created_at,
        updated_at,
        cohort:cohort_id (
          id,
          name,
          start_date,
          end_date,
          status,
          bootcamp_program:bootcamp_program_id (
            id,
            name,
            description,
            duration_weeks,
            max_reward_dgt,
            image_url
          )
        )
      `,
      )
      .eq("user_profile_id", profile.id)
      .order("created_at", { ascending: false });

    if (enrollmentsError) {
      throw new Error(
        `Failed to fetch enrollments: ${enrollmentsError.message}`,
      );
    }

    // For each enrollment, get milestone progress
    const enrollmentsWithProgress: EnrollmentWithDetails[] = [];

    const enrollments = (enrollmentsData || []) as unknown as RawEnrollment[];
    for (const enrollment of enrollments) {
      // Get milestone progress for this cohort
      const { data: milestoneProgressData } = await supabase
        .from("user_milestone_progress")
        .select(
          `
          milestone_id,
          status,
          progress_percentage,
          milestone:milestone_id (
            id,
            name,
            order_index
          )
        `,
        )
        .eq("user_profile_id", profile.id)
        .in("milestone_id", [
          // Get all milestone IDs for this cohort
          ...((
            await supabase
              .from("cohort_milestones")
              .select("id")
              .eq("cohort_id", enrollment.cohort.id)
          ).data?.map((m) => m.id) || []),
        ]);

      // Calculate milestone progress stats
      const milestoneProgress = (milestoneProgressData ||
        []) as unknown as RawMilestoneProgress[];
      const totalMilestones = milestoneProgress.length;
      const completedMilestones = milestoneProgress.filter(
        (mp) => mp.status === "completed",
      ).length;
      const currentMilestone = milestoneProgress.find(
        (mp) => mp.status === "in_progress",
      );

      enrollmentsWithProgress.push({
        ...enrollment,
        milestone_progress: {
          total_milestones: totalMilestones,
          completed_milestones: completedMilestones,
          current_milestone: currentMilestone
            ? {
                id: currentMilestone.milestone.id,
                name: currentMilestone.milestone.name,
                progress_percentage: currentMilestone.progress_percentage,
              }
            : undefined,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: enrollmentsWithProgress,
    });
  } catch (error: any) {
    log.error("Error fetching user enrollments:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch enrollments",
    });
  }
}
