// import { NextApiRequest, NextApiResponse } from "next";
// import { createAdminClient } from "@/lib/supabase/server";
// import { getPrivyUser } from "@/lib/auth/privy";
// import type { ApiResponse } from "@/lib/api";

// interface MilestoneTask {
//   id: string;
//   title: string;
//   description: string;
//   task_type: string;
//   reward_amount: number;
//   order_index: number;
//   submission_requirements: any;
//   validation_criteria: any;
//   requires_admin_review: boolean;
// }

// interface MilestoneWithProgress {
//   id: string;
//   name: string;
//   description: string;
//   order_index: number;
//   duration_hours: number;
//   total_reward: number;
//   start_date?: string;
//   end_date?: string;
//   tasks: MilestoneTask[];
//   user_progress?: {
//     status: string;
//     progress_percentage: number;
//     tasks_completed: number;
//     total_tasks: number;
//     started_at?: string;
//     completed_at?: string;
//     reward_amount: number;
//   };
// }

// interface CohortMilestonesResponse {
//   cohort: {
//     id: string;
//     name: string;
//     bootcamp_program: {
//       name: string;
//       description: string;
//     };
//   };
//   milestones: MilestoneWithProgress[];
//   overall_progress: {
//     completed_milestones: number;
//     total_milestones: number;
//     overall_percentage: number;
//     total_earned_rewards: number;
//     max_possible_rewards: number;
//   };
// }

// export default async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse<ApiResponse<CohortMilestonesResponse>>
// ) {
//   if (req.method !== "GET") {
//     return res.status(405).json({ 
//       success: false, 
//       error: "Method not allowed" 
//     });
//   }

//   try {
//     const supabase = createAdminClient();
//     const user = await getPrivyUser(req);
    
//     if (!user?.id) {
//       return res.status(401).json({
//         success: false,
//         error: "Authentication required",
//       });
//     }

//     const { cohortId } = req.query;
//     if (!cohortId || typeof cohortId !== "string") {
//       return res.status(400).json({
//         success: false,
//         error: "Invalid cohort ID"
//       });
//     }

//     // Get user profile
//     const { data: profile, error: profileError } = await supabase
//       .from("user_profiles")
//       .select("id, privy_user_id")
//       .eq("privy_user_id", user.id)
//       .maybeSingle();

//     if (profileError || !profile) {
//       return res.status(404).json({
//         success: false,
//         error: "User profile not found",
//       });
//     }

//     // Verify user is enrolled in this cohort
//     const { data: enrollment, error: enrollmentError } = await supabase
//       .from("bootcamp_enrollments")
//       .select("id, enrollment_status")
//       .eq("user_profile_id", profile.id)
//       .eq("cohort_id", cohortId)
//       .in("enrollment_status", ["enrolled", "active"])
//       .maybeSingle();

//     if (enrollmentError || !enrollment) {
//       console.log("Enrollment check failed:", { 
//         error: enrollmentError, 
//         enrollment, 
//         user_profile_id: profile.id, 
//         cohortId 
//       });
//       return res.status(403).json({
//         success: false,
//         error: "You are not enrolled in this cohort",
//       });
//     }

//     // Get cohort details
//     const { data: cohort, error: cohortError } = await supabase
//       .from("cohorts")
//       .select(`
//         id,
//         name,
//         bootcamp_program:bootcamp_program_id (
//           name,
//           description
//         )
//       `)
//       .eq("id", cohortId)
//       .single();

//     if (cohortError || !cohort) {
//       return res.status(404).json({
//         success: false,
//         error: "Cohort not found",
//       });
//     }

//     // Get milestones for this cohort
//     const { data: milestones, error: milestonesError } = await supabase
//       .from("cohort_milestones")
//       .select(`
//         id,
//         name,
//         description,
//         order_index,
//         duration_hours,
//         total_reward,
//         start_date,
//         end_date
//       `)
//       .eq("cohort_id", cohortId)
//       .order("order_index", { ascending: true });

//     if (milestonesError) {
//       throw new Error(`Failed to fetch milestones: ${milestonesError.message}`);
//     }

//     // Get milestone progress for this user
//     const milestoneIds = (milestones || []).map(m => m.id);
//     const { data: milestoneProgress } = await supabase
//       .from("user_milestone_progress")
//       .select("*")
//       .eq("user_profile_id", profile.id)
//       .in("milestone_id", milestoneIds);

//     // Get tasks for each milestone with latest submission status for this user
//     const { data: allTasks } = await supabase
//       .from("milestone_tasks")
//       .select(`
//         id,
//         milestone_id,
//         title,
//         description,
//         task_type,
//         reward_amount,
//         order_index,
//         submission_requirements,
//         validation_criteria,
//         requires_admin_review,
//         submissions:task_submissions!task_submissions_task_id_fkey(
//           id, status, submission_url, submitted_at, submission_type
//         )
//       `)
//       .in("milestone_id", milestoneIds)
//       .eq('submissions.user_id', user.id)
//       .order("order_index", { ascending: true });

//     // Build response with milestones, tasks, and user progress
//     const milestonesWithProgress: MilestoneWithProgress[] = (milestones || []).map(milestone => {
//       const tasks = (allTasks || [])
//         .filter((task: any) => task.milestone_id === milestone.id)
//         .map((t: any) => {
//           const latest = Array.isArray(t.submissions) ? t.submissions[0] : undefined;
//           const submission_status = latest?.status || null;
//           const latest_submission = latest
//             ? {
//                 id: latest.id,
//                 submission_url: latest.submission_url,
//                 submission_type: latest.submission_type,
//                 submitted_at: latest.submitted_at,
//                 status: latest.status,
//               }
//             : null;
//           const { submissions, ...rest } = t;
//           return { ...rest, submission_status, latest_submission };
//         });
//       const progress = (milestoneProgress || []).find(p => p.milestone_id === milestone.id);

//       return {
//         ...milestone,
//         tasks,
//         user_progress: progress ? {
//           status: progress.status,
//           progress_percentage: progress.progress_percentage,
//           tasks_completed: progress.tasks_completed,
//           total_tasks: progress.total_tasks,
//           started_at: progress.started_at,
//           completed_at: progress.completed_at,
//           reward_amount: progress.reward_amount
//         } : undefined
//       };
//     });

//     // Calculate overall progress
//     const totalMilestones = milestonesWithProgress.length;
//     const completedMilestones = milestonesWithProgress.filter(
//       m => m.user_progress?.status === 'completed'
//     ).length;
//     const totalEarnedRewards = milestonesWithProgress.reduce(
//       (sum, m) => sum + (m.user_progress?.reward_amount || 0), 0
//     );
//     const maxPossibleRewards = milestonesWithProgress.reduce(
//       (sum, m) => sum + (m.total_reward || 0), 0
//     );

//     // Normalize bootcamp_program shape for TS
//     const program: any = Array.isArray(cohort.bootcamp_program)
//       ? cohort.bootcamp_program[0]
//       : cohort.bootcamp_program;

//     res.status(200).json({
//       success: true,
//       data: {
//         cohort: {
//           id: cohort.id,
//           name: cohort.name,
//           bootcamp_program: {
//             name: program?.name,
//             description: program?.description,
//           }
//         },
//         milestones: milestonesWithProgress,
//         overall_progress: {
//           completed_milestones: completedMilestones,
//           total_milestones: totalMilestones,
//           overall_percentage: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
//           total_earned_rewards: totalEarnedRewards,
//           max_possible_rewards: maxPossibleRewards
//         }
//       }
//     });

//   } catch (error: any) {
//     console.error("Error fetching cohort milestones:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message || "Failed to fetch cohort milestones",
//     });
//   }
// }


// import { NextApiRequest, NextApiResponse } from "next";
// import { createAdminClient } from "@/lib/supabase/server";
// import { getPrivyUser } from "@/lib/auth/privy";
// import type { ApiResponse } from "@/lib/api";

// interface MilestoneTask {
//   id: string;
//   title: string;
//   description: string;
//   task_type: string;
//   reward_amount: number;
//   order_index: number;
//   submission_requirements: any;
//   validation_criteria: any;
//   requires_admin_review: boolean;
// }

// interface MilestoneWithProgress {
//   id: string;
//   name: string;
//   description: string;
//   order_index: number;
//   duration_hours: number;
//   total_reward: number;
//   start_date?: string;
//   end_date?: string;
//   tasks: MilestoneTask[];
//   user_progress?: {
//     status: string;
//     progress_percentage: number;
//     tasks_completed: number;
//     total_tasks: number;
//     started_at?: string;
//     completed_at?: string;
//     reward_amount: number;
//   };
// }

// interface CohortMilestonesResponse {
//   cohort: {
//     id: string;
//     name: string;
//     bootcamp_program: {
//       name: string;
//       description: string;
//     };
//   };
//   milestones: MilestoneWithProgress[];
//   overall_progress: {
//     completed_milestones: number;
//     total_milestones: number;
//     overall_percentage: number;
//     total_earned_rewards: number;
//     max_possible_rewards: number;
//   };
// }

// export default async function handler(
//   req: NextApiRequest,
//   res: NextApiResponse<ApiResponse<CohortMilestonesResponse>>
// ) {
//   if (req.method !== "GET") {
//     return res.status(405).json({ 
//       success: false, 
//       error: "Method not allowed" 
//     });
//   }

//   try {
//     const supabase = createAdminClient();
//     const user = await getPrivyUser(req);
    
//     if (!user?.id) {
//       return res.status(401).json({
//         success: false,
//         error: "Authentication required",
//       });
//     }

//     const { cohortId } = req.query;
//     if (!cohortId || typeof cohortId !== "string") {
//       return res.status(400).json({
//         success: false,
//         error: "Invalid cohort ID"
//       });
//     }

//     // Get user profile
//     const { data: profile, error: profileError } = await supabase
//       .from("user_profiles")
//       .select("id, privy_user_id")
//       .eq("privy_user_id", user.id)
//       .maybeSingle();

//     if (profileError || !profile) {
//       return res.status(404).json({
//         success: false,
//         error: "User profile not found",
//       });
//     }

//     // Verify user is enrolled in this cohort
//     const { data: enrollment, error: enrollmentError } = await supabase
//       .from("bootcamp_enrollments")
//       .select("id, enrollment_status")
//       .eq("user_profile_id", profile.id)
//       .eq("cohort_id", cohortId)
//       .in("enrollment_status", ["enrolled", "active"])
//       .maybeSingle();

//     if (enrollmentError || !enrollment) {
//       console.log("Enrollment check failed:", { 
//         error: enrollmentError, 
//         enrollment, 
//         user_profile_id: profile.id, 
//         cohortId 
//       });
//       return res.status(403).json({
//         success: false,
//         error: "You are not enrolled in this cohort",
//       });
//     }

//     // Get cohort details
//     const { data: cohort, error: cohortError } = await supabase
//       .from("cohorts")
//       .select(`
//         id,
//         name,
//         bootcamp_program:bootcamp_program_id (
//           name,
//           description
//         )
//       `)
//       .eq("id", cohortId)
//       .single();

//     if (cohortError || !cohort) {
//       return res.status(404).json({
//         success: false,
//         error: "Cohort not found",
//       });
//     }

//     // Get milestones for this cohort
//     const { data: milestones, error: milestonesError } = await supabase
//       .from("cohort_milestones")
//       .select(`
//         id,
//         name,
//         description,
//         order_index,
//         duration_hours,
//         total_reward,
//         start_date,
//         end_date
//       `)
//       .eq("cohort_id", cohortId)
//       .order("order_index", { ascending: true });

//     if (milestonesError) {
//       throw new Error(`Failed to fetch milestones: ${milestonesError.message}`);
//     }

//     // Get milestone progress for this user
//     const milestoneIds = (milestones || []).map(m => m.id);
//     const { data: milestoneProgress } = await supabase
//       .from("user_milestone_progress")
//       .select("*")
//       .eq("user_profile_id", profile.id)
//       .in("milestone_id", milestoneIds);

//     // Get tasks for each milestone with latest submission status and progress for this user
//     const { data: allTasks } = await supabase
//       .from("milestone_tasks")
//       .select(`
//         id,
//         milestone_id,
//         title,
//         description,
//         task_type,
//         reward_amount,
//         order_index,
//         submission_requirements,
//         validation_criteria,
//         requires_admin_review,
//         submissions:task_submissions!task_submissions_task_id_fkey(
//           id, status, submission_url, submitted_at, submission_type
//         ),
//         user_progress:user_task_progress!user_task_progress_task_id_fkey(
//           id, status, submission_id, reward_claimed, completed_at
//         )
//       `)
//       .in("milestone_id", milestoneIds)
//       .eq('submissions.user_id', user.id)
//       .eq('user_progress.user_profile_id', profile.id)
//       .order("order_index", { ascending: true });

//     // Build response with milestones, tasks, and user progress
//     const milestonesWithProgress: MilestoneWithProgress[] = (milestones || []).map(milestone => {
//       const tasks = (allTasks || [])
//         .filter((task: any) => task.milestone_id === milestone.id)
//         .map((t: any) => {
//           const latest = Array.isArray(t.submissions) ? t.submissions[0] : undefined;
//           const submission_status = latest?.status || null;
//           const latest_submission = latest
//             ? {
//                 id: latest.id,
//                 submission_url: latest.submission_url,
//                 submission_type: latest.submission_type,
//                 submitted_at: latest.submitted_at,
//                 status: latest.status,
//               }
//             : null;
//           const { submissions, ...rest } = t;
//           return { ...rest, submission_status, latest_submission };
//         });
//       const progress = (milestoneProgress || []).find(p => p.milestone_id === milestone.id);

//       return {
//         ...milestone,
//         tasks,
//         user_progress: progress ? {
//           status: progress.status,
//           progress_percentage: progress.progress_percentage,
//           tasks_completed: progress.tasks_completed,
//           total_tasks: progress.total_tasks,
//           started_at: progress.started_at,
//           completed_at: progress.completed_at,
//           reward_amount: progress.reward_amount
//         } : undefined
//       };
//     });

//     // Calculate overall progress
//     const totalMilestones = milestonesWithProgress.length;
//     const completedMilestones = milestonesWithProgress.filter(
//       m => m.user_progress?.status === 'completed'
//     ).length;
//     const totalEarnedRewards = milestonesWithProgress.reduce(
//       (sum, m) => sum + (m.user_progress?.reward_amount || 0), 0
//     );
//     const maxPossibleRewards = milestonesWithProgress.reduce(
//       (sum, m) => sum + (m.total_reward || 0), 0
//     );

//     // Normalize bootcamp_program shape for TS
//     const program: any = Array.isArray(cohort.bootcamp_program)
//       ? cohort.bootcamp_program[0]
//       : cohort.bootcamp_program;

//     res.status(200).json({
//       success: true,
//       data: {
//         cohort: {
//           id: cohort.id,
//           name: cohort.name,
//           bootcamp_program: {
//             name: program?.name,
//             description: program?.description,
//           }
//         },
//         milestones: milestonesWithProgress,
//         overall_progress: {
//           completed_milestones: completedMilestones,
//           total_milestones: totalMilestones,
//           overall_percentage: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
//           total_earned_rewards: totalEarnedRewards,
//           max_possible_rewards: maxPossibleRewards
//         }
//       }
//     });

//   } catch (error: any) {
//     console.error("Error fetching cohort milestones:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message || "Failed to fetch cohort milestones",
//     });
//   }
// }


import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/api";
import { UserKeyService } from "@/lib/services/user-key-service";

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
  lock_address?: string | null; // Add lock_address
  has_key?: boolean; // Add has_key for on-chain status
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
        end_date,
        lock_address
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

    // Get all tasks for each milestone
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

    // Get all task submissions for this user 
    const taskIds = (allTasks || []).map(t => t.id);
    const { data: submissions } = await supabase
      .from("task_submissions")
      .select("id, task_id, status, submission_url, submitted_at, submission_type")
      .eq("user_id", user.id)
      .in("task_id", taskIds)
      .order("submitted_at", { ascending: false });

    // Get user progress for these tasks
    const { data: userProgress } = await supabase
      .from("user_task_progress") 
      .select("id, task_id, status, submission_id, reward_claimed, completed_at")
      .eq("user_profile_id", profile.id)
      .in("task_id", taskIds);

    // Build response with milestones, tasks, and user progress
    const milestonesWithProgress: MilestoneWithProgress[] = (milestones || []).map(milestone => {
      const tasks = (allTasks || [])
        .filter((task: any) => task.milestone_id === milestone.id)
        .map((t: any) => {
          // Find the latest submission for this task
          const taskSubmissions = (submissions || []).filter(sub => sub.task_id === t.id);
          const latest = taskSubmissions.length > 0 ? taskSubmissions[0] : undefined;
          const submission_status = latest?.status || null;
          const latest_submission = latest
            ? {
                id: latest.id,
                submission_url: latest.submission_url,
                submission_type: latest.submission_type,
                submitted_at: latest.submitted_at,
                status: latest.status,
              }
            : null;

          // Get the user progress for this task
          const taskProgress = (userProgress || []).find(progress => progress.task_id === t.id);
          const reward_claimed = taskProgress?.reward_claimed || false;

          return { ...t, submission_status, latest_submission, reward_claimed };
        });
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

    // --- NEW: Add on-chain key ownership status ---
    const milestonesWithOnChainStatus = await Promise.all(
      milestonesWithProgress.map(async (milestone) => {
        if (!milestone.lock_address) {
          return { ...milestone, has_key: false };
        }
        const keyCheck = await UserKeyService.checkUserKeyOwnership(user.id, milestone.lock_address);
        return { ...milestone, has_key: keyCheck.hasValidKey };
      })
    );
    // --- END NEW ---

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

    // Normalize bootcamp_program shape for TS
    const program: any = Array.isArray(cohort.bootcamp_program)
      ? cohort.bootcamp_program[0]
      : cohort.bootcamp_program;

    res.status(200).json({
      success: true,
      data: {
        cohort: {
          id: cohort.id,
          name: cohort.name,
          bootcamp_program: {
            name: program?.name,
            description: program?.description,
          }
        },
        milestones: milestonesWithOnChainStatus, // Use the enhanced milestones
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