import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import type { ApiResponse } from "@/lib/api";

interface TaskSubmissionData {
  submission_type: 'url' | 'file' | 'text' | 'contract_interaction' | 'external_verification';
  submission_url?: string;
  submission_data?: any;
  file_urls?: string[];
  submission_metadata?: any;
}

interface TaskSubmissionResponse {
  id: string;
  status: string;
  submitted_at: string;
  task: {
    id: string;
    title: string;
    reward_amount: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TaskSubmissionResponse>>
) {
  if (req.method !== "POST") {
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

    const { taskId } = req.query;
    const submissionData: TaskSubmissionData = req.body;

    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID"
      });
    }

    // Validate submission data
    if (!submissionData.submission_type) {
      return res.status(400).json({
        success: false,
        error: "Submission type is required"
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

    // Get task details and verify user can access it
    const { data: task, error: taskError } = await supabase
      .from("milestone_tasks")
      .select(`
        id,
        title,
        reward_amount,
        task_type,
        submission_requirements,
        milestone:milestone_id (
          id,
          cohort_id
        )
      `)
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // Verify user is enrolled in the cohort
    const cohortId = Array.isArray(task.milestone) ? task.milestone[0]?.cohort_id : task.milestone?.cohort_id;
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("bootcamp_enrollments")
      .select("id")
      .eq("user_profile_id", profile.id)
      .eq("cohort_id", cohortId)
      .in("enrollment_status", ["enrolled", "active"])
      .maybeSingle();

    if (enrollmentError || !enrollment) {
      return res.status(403).json({
        success: false,
        error: "You are not enrolled in this cohort",
      });
    }

    // Check if user already has a pending or completed submission
    const { data: existingSubmission } = await supabase
      .from("task_submissions")
      .select("id, status")
      .eq("task_id", taskId)
      .eq("user_id", user.id)
      .in("status", ["pending", "completed"])
      .maybeSingle();

    if (existingSubmission) {
      return res.status(409).json({
        success: false,
        error: `You already have a ${existingSubmission.status} submission for this task`,
      });
    }

    // Create task submission
    const { data: submission, error: submissionError } = await supabase
      .from("task_submissions")
      .insert({
        task_id: taskId,
        user_id: user.id,
        submission_type: submissionData.submission_type,
        submission_url: submissionData.submission_url,
        submission_data: submissionData.submission_data || {},
        file_urls: submissionData.file_urls || [],
        submission_metadata: submissionData.submission_metadata || {},
        status: 'pending'
      })
      .select(`
        id,
        status,
        submitted_at
      `)
      .single();

    if (submissionError) {
      throw new Error(`Failed to create submission: ${submissionError.message}`);
    }

    res.status(201).json({
      success: true,
      data: {
        id: submission.id,
        status: submission.status,
        submitted_at: submission.submitted_at,
        task: {
          id: task.id,
          title: task.title,
          reward_amount: task.reward_amount
        }
      }
    });

  } catch (error: any) {
    console.error("Error creating task submission:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create task submission",
    });
  }
}