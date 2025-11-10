import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/helpers/api";
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

    // For each enrollment, get milestone progress — optimized to avoid N+1 queries
    const enrollmentsWithProgress: EnrollmentWithDetails[] = [];

    const enrollments = (enrollmentsData || []) as unknown as RawEnrollment[];

    // Short-circuit when there are no enrollments
    if (enrollments.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    // 1) Fetch all cohort milestones for all cohort_ids in one query
    const cohortIds = Array.from(new Set(enrollments.map((e) => e.cohort.id)));

    type CohortMilestone = {
      id: string;
      name: string;
      order_index: number;
      cohort_id: string;
    };

    const { data: allCohortMilestones, error: cmErr } = await supabase
      .from("cohort_milestones")
      .select("id, name, order_index, cohort_id")
      .in("cohort_id", cohortIds)
      .order("order_index", { ascending: true });

    if (cmErr) {
      throw new Error(`Failed to fetch cohort milestones: ${cmErr.message}`);
    }

    const milestonesByCohort = new Map<string, CohortMilestone[]>();
    for (const m of (allCohortMilestones || []) as CohortMilestone[]) {
      const list = milestonesByCohort.get(m.cohort_id) || [];
      list.push(m);
      milestonesByCohort.set(m.cohort_id, list);
    }

    // 2) Fetch all user milestone progress rows for those milestones in one query
    const allMilestoneIds = (
      (allCohortMilestones || []) as CohortMilestone[]
    ).map((m) => m.id);

    type UserProgressRow = {
      milestone_id: string;
      status: string;
      progress_percentage: number;
    };

    let progressByMilestone = new Map<string, UserProgressRow>();
    if (allMilestoneIds.length > 0) {
      const { data: allProgress, error: mpErr } = await supabase
        .from("user_milestone_progress")
        .select("milestone_id, status, progress_percentage")
        .eq("user_profile_id", profile.id)
        .in("milestone_id", allMilestoneIds);

      if (mpErr) {
        throw new Error(`Failed to fetch milestone progress: ${mpErr.message}`);
      }

      for (const row of (allProgress || []) as UserProgressRow[]) {
        // If duplicates exist per milestone, last write wins (should be unique in practice)
        progressByMilestone.set(row.milestone_id, row);
      }
    }

    // 3) Assemble per-enrollment milestone summary using the prefetched data
    for (const enrollment of enrollments) {
      const cohortMilestones =
        milestonesByCohort.get(enrollment.cohort.id) || [];
      const totalMilestones = cohortMilestones.length;

      // Compute completed and current milestones for this cohort
      let completedMilestones = 0;
      let current:
        | { id: string; name: string; progress_percentage: number }
        | undefined;

      for (const m of cohortMilestones) {
        const p = progressByMilestone.get(m.id);
        if (!p) continue;
        if (p.status === "completed") completedMilestones++;
        if (p.status === "in_progress") {
          // Choose the first in-progress by order_index since cohortMilestones are sorted
          if (!current) {
            current = {
              id: m.id,
              name: m.name,
              progress_percentage: p.progress_percentage,
            };
          }
        }
      }

      // Fallback current = first uncompleted milestone by order
      if (!current && totalMilestones > 0) {
        const completedIds = new Set(
          cohortMilestones
            .filter(
              (m) => progressByMilestone.get(m.id)?.status === "completed",
            )
            .map((m) => m.id),
        );
        const firstUncompleted = cohortMilestones.find(
          (m) => !completedIds.has(m.id),
        );
        if (firstUncompleted) {
          current = {
            id: firstUncompleted.id,
            name: firstUncompleted.name,
            progress_percentage: 0,
          };
        }
      }

      enrollmentsWithProgress.push({
        ...enrollment,
        milestone_progress: {
          total_milestones: totalMilestones,
          completed_milestones: completedMilestones,
          current_milestone: current,
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
