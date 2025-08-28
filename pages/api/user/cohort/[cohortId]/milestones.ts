import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/api";

interface MilestoneTask {
  id: string;
  title: string;
  description: string;
  task_type: string;
  reward_amount: number;
  order_index: number;
  submission_requirements: any;
  validation_criteria: any;
  requires_admin_review: boolean;
}

interface MilestoneWithProgress {
  id: string;
  name: string;
  description: string;
  order_index: number;
  duration_hours: number;
  total_reward: number;
  start_date?: string;
  end_date?: string;
  tasks: MilestoneTask[];
  user_progress?: {
    status: string;
    progress_percentage: number;
    tasks_completed: number;
    total_tasks: number;
    started_at?: string;
    completed_at?: string;
    reward_amount: number;
  };
}

interface CohortMilestonesResponse {
  cohort: {
    id: string;
    name: string;
    bootcamp_program: {
      name: string;
      description: string;
    };
  };
  milestones: MilestoneWithProgress[];
  overall_progress: {
    completed_milestones: number;
    total_milestones: number;
    overall_percentage: number;
    total_earned_rewards: number;
    max_possible_rewards: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<CohortMilestonesResponse>>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ 
      success: false, 
      error: "Method not allowed" 
    });
  }

  try {
    const supabase = createAdminClient();
    const user = await getPrivyUser(req);
    
    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const { cohortId } = req.query;
    if (!cohortId || typeof cohortId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid cohort ID"
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, privy_user_id")
      .eq("privy_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: "User profile not found",
      });
    }

    // Verify user is enrolled in this cohort
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("bootcamp_enrollments")
      .select("id, enrollment_status")
      .eq("user_profile_id", profile.id)
      .eq("cohort_id", cohortId)
      .in("enrollment_status", ["enrolled", "active"])
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      console.log("Enrollment check failed:", { 
        error: enrollmentError, 
        enrollment, 
        user_profile_id: profile.id, 
        cohortId 
      });
      return res.status(403).json({
        success: false,
        error: "You are not enrolled in this cohort",
      });
    }

    // Get cohort details
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .select(`
        id,
        name,
        bootcamp_program:bootcamp_program_id (
          name,
          description
        )
      `)
      .eq("id", cohortId)
      .single();

    if (cohortError || !cohort) {
      return res.status(404).json({
        success: false,
        error: "Cohort not found",
      });
    }

    // Get milestones for this cohort
    const { data: milestones, error: milestonesError } = await supabase
      .from("cohort_milestones")
      .select(`
        id,
        name,
        description,
        order_index,
        duration_hours,
        total_reward,
        start_date,
        end_date
      `)
      .eq("cohort_id", cohortId)
      .order("order_index", { ascending: true });

    if (milestonesError) {
      throw new Error(`Failed to fetch milestones: ${milestonesError.message}`);
    }

    // Get milestone progress for this user
    const milestoneIds = (milestones || []).map(m => m.id);
    const { data: milestoneProgress } = await supabase
      .from("user_milestone_progress")
      .select("*")
      .eq("user_profile_id", profile.id)
      .in("milestone_id", milestoneIds);

    // Get tasks for each milestone
    const { data: allTasks } = await supabase
      .from("milestone_tasks")
      .select(`
        id,
        milestone_id,
        title,
        description,
        task_type,
        reward_amount,
        order_index,
        submission_requirements,
        validation_criteria,
        requires_admin_review
      `)
      .in("milestone_id", milestoneIds)
      .order("order_index", { ascending: true });

    // Build response with milestones, tasks, and user progress
    const milestonesWithProgress: MilestoneWithProgress[] = (milestones || []).map(milestone => {
      const tasks = (allTasks || []).filter(task => task.milestone_id === milestone.id);
      const progress = (milestoneProgress || []).find(p => p.milestone_id === milestone.id);

      return {
        ...milestone,
        tasks,
        user_progress: progress ? {
          status: progress.status,
          progress_percentage: progress.progress_percentage,
          tasks_completed: progress.tasks_completed,
          total_tasks: progress.total_tasks,
          started_at: progress.started_at,
          completed_at: progress.completed_at,
          reward_amount: progress.reward_amount
        } : undefined
      };
    });

    // Calculate overall progress
    const totalMilestones = milestonesWithProgress.length;
    const completedMilestones = milestonesWithProgress.filter(
      m => m.user_progress?.status === 'completed'
    ).length;
    const totalEarnedRewards = milestonesWithProgress.reduce(
      (sum, m) => sum + (m.user_progress?.reward_amount || 0), 0
    );
    const maxPossibleRewards = milestonesWithProgress.reduce(
      (sum, m) => sum + (m.total_reward || 0), 0
    );

    res.status(200).json({
      success: true,
      data: {
        cohort: {
          id: cohort.id,
          name: cohort.name,
          bootcamp_program: {
            name: Array.isArray(cohort.bootcamp_program) 
              ? cohort.bootcamp_program[0]?.name 
              : cohort.bootcamp_program?.name,
            description: Array.isArray(cohort.bootcamp_program)
              ? cohort.bootcamp_program[0]?.description
              : cohort.bootcamp_program?.description,
          }
        },
        milestones: milestonesWithProgress,
        overall_progress: {
          completed_milestones: completedMilestones,
          total_milestones: totalMilestones,
          overall_percentage: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
          total_earned_rewards: totalEarnedRewards,
          max_possible_rewards: maxPossibleRewards
        }
      }
    });

  } catch (error: any) {
    console.error("Error fetching cohort milestones:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch cohort milestones",
    });
  }
}