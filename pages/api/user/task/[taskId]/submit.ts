import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getMilestoneTimingInfo } from "@/lib/utils/milestone-utils";
import type { ApiResponse } from "@/lib/api";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:task:[taskId]:submit");

interface TaskSubmissionData {
  submission_type:
    | "url"
    | "file"
    | "text"
    | "contract_interaction"
    | "external_verification";
  submission_url?: string;
  submission_data?: any;
  file_urls?: string[];
  submission_metadata?: any;
}

interface TaskSubmissionResponse {
  id: string;
  status: string;
  submitted_at: string;
  rewards_available: boolean;
  effective_reward_amount: number;
  task: {
    id: string;
    title: string;
    reward_amount: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<TaskSubmissionResponse>>,
) {
  if (!["POST", "PUT"].includes(req.method || "")) {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
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
    const submissionData: TaskSubmissionData & { submission_id?: string } =
      req.body;

    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
      });
    }

    // Validate submission data
    if (!submissionData.submission_type) {
      return res.status(400).json({
        success: false,
        error: "Submission type is required",
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
      .select(
        `
        id,
        title,
        reward_amount,
        task_type,
        submission_requirements,
        milestone:milestone_id (
          id,
          cohort_id,
          start_date,
          end_date
        )
      `,
      )
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // Verify user is enrolled in the cohort
    const taskMilestone = task.milestone as any;
    const cohortId = taskMilestone?.cohort_id;
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

    // Check milestone timing
    const milestone = Array.isArray(task.milestone)
      ? task.milestone[0]
      : task.milestone;
    const timing = getMilestoneTimingInfo(
      milestone?.start_date,
      milestone?.end_date,
    );
    if (timing.status === "not_started") {
      return res.status(400).json({
        success: false,
        error:
          "This milestone is not yet available. Please wait until the start date.",
      });
    }
    const rewardsAvailable = timing.status === "active";
    const effectiveRewardAmount = rewardsAvailable ? task.reward_amount : 0;

    // Check if user already has any submission for this task
    const { data: existingSubmission } = await supabase
      .from("task_submissions")
      .select("id, status")
      .eq("task_id", taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    // If user has a pending or completed submission, prevent new submission
    if (existingSubmission && existingSubmission.status === "pending") {
      return res.status(409).json({
        success: false,
        error:
          "You already have a pending submission for this task. Please wait for review.",
      });
    }

    if (existingSubmission && existingSubmission.status === "completed") {
      return res.status(409).json({
        success: false,
        error: "You have already completed this task.",
      });
    }

    let submission;

    // Handle explicit PUT request with submission_id
    if (req.method === "PUT" && submissionData.submission_id) {
      const { data: existing, error: fetchErr } = await supabase
        .from("task_submissions")
        .select("id, status, user_id")
        .eq("id", submissionData.submission_id)
        .single();
      if (fetchErr || !existing) {
        return res
          .status(404)
          .json({ success: false, error: "Submission not found" });
      }
      if (existing.user_id !== user.id) {
        return res.status(403).json({
          success: false,
          error: "Not allowed to edit this submission",
        });
      }
      if (!["pending", "failed", "retry"].includes(existing.status)) {
        return res.status(400).json({
          success: false,
          error: "Only pending, failed, or retry submissions can be edited",
        });
      }
      const { data: updated, error: updateErr } = await supabase
        .from("task_submissions")
        .update({
          submission_type: submissionData.submission_type,
          submission_url: submissionData.submission_url,
          submission_data: submissionData.submission_data || {},
          file_urls: submissionData.file_urls || [],
          submission_metadata: submissionData.submission_metadata || {},
          status: "pending", // Reset status to pending for resubmission
          submitted_at: new Date().toISOString(), // Update submission time
          updated_at: new Date().toISOString(),
          reviewed_at: null, // Clear previous review
          reviewed_by: null,
          feedback: null,
        })
        .eq("id", submissionData.submission_id)
        .select(`id,status,submitted_at`)
        .single();
      if (updateErr) {
        throw new Error(`Failed to update submission: ${updateErr.message}`);
      }
      submission = updated;
    }
    // If user has a failed or retry submission, update it instead of creating new
    else if (
      existingSubmission &&
      ["failed", "retry"].includes(existingSubmission.status)
    ) {
      const { data: updated, error: updateErr } = await supabase
        .from("task_submissions")
        .update({
          submission_type: submissionData.submission_type,
          submission_url: submissionData.submission_url,
          submission_data: submissionData.submission_data || {},
          file_urls: submissionData.file_urls || [],
          submission_metadata: submissionData.submission_metadata || {},
          status: "pending", // Reset status to pending for resubmission
          submitted_at: new Date().toISOString(), // Update submission time
          updated_at: new Date().toISOString(),
          reviewed_at: null, // Clear previous review
          reviewed_by: null,
          feedback: null,
        })
        .eq("id", existingSubmission.id)
        .select(`id,status,submitted_at`)
        .single();
      if (updateErr) {
        throw new Error(`Failed to update submission: ${updateErr.message}`);
      }
      submission = updated;
    }
    // Create new submission if no existing submission
    else {
      const { data: created, error: submissionError } = await supabase
        .from("task_submissions")
        .insert({
          task_id: taskId,
          user_id: user.id,
          submission_type: submissionData.submission_type,
          submission_url: submissionData.submission_url,
          submission_data: submissionData.submission_data || {},
          file_urls: submissionData.file_urls || [],
          submission_metadata: submissionData.submission_metadata || {},
          status: "pending",
        })
        .select(
          `
          id,
          status,
          submitted_at
        `,
        )
        .single();
      if (submissionError) {
        throw new Error(
          `Failed to create submission: ${submissionError.message}`,
        );
      }
      submission = created;
    }

    // Determine response status: 200 for updates, 201 for new creations
    const statusCode = existingSubmission ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: {
        id: submission.id,
        status: submission.status,
        submitted_at: submission.submitted_at,
        rewards_available: rewardsAvailable,
        effective_reward_amount: effectiveRewardAmount,
        task: {
          id: task.id,
          title: task.title,
          reward_amount: task.reward_amount,
        },
      },
    });
  } catch (error: any) {
    log.error("Error creating task submission:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create task submission",
    });
  }
}
