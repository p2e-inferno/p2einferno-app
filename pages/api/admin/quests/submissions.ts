import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:quests:submissions");

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const supabase = createAdminClient();

    switch (req.method) {
      case "GET":
        return await getSubmissions(req, res, supabase);
      case "PUT":
        return await updateSubmissionStatus(req, res, supabase);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    log.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

async function getSubmissions(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
) {
  const { questId, status, limit = 50, offset = 0 } = req.query;

  try {
    let query = supabase
      .from("user_task_completions")
      .select(
        `
        *,
        task:quest_tasks!user_task_completions_task_id_fkey (
          id,
          title,
          task_type,
          input_label
        ),
        user:user_profiles!user_task_completions_user_id_fkey (
          id,
          email,
          wallet_address,
          display_name,
          privy_user_id
        )
      `,
      )
      .order("completed_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (questId) {
      query = query.eq("quest_id", questId);
    }

    if (status && status !== "all") {
      query = query.eq("submission_status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ submissions: data || [] });
  } catch (error: any) {
    log.error("Error fetching submissions:", error);
    return res.status(500).json({ error: "Failed to fetch submissions" });
  }
}

async function updateSubmissionStatus(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any,
) {
  const { submissionId, status, feedback } = req.body;

  if (!submissionId || !status) {
    return res
      .status(400)
      .json({ error: "Submission ID and status are required" });
  }

  if (!["pending", "completed", "failed", "retry"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  if (status !== "completed" && !feedback?.trim()) {
    return res
      .status(400)
      .json({ error: "Feedback is required for non-completed status" });
  }

  try {
    // Get the current submission with task details
    const { data: currentSubmission, error: fetchError } = await supabase
      .from("user_task_completions")
      .select(
        `
        *,
        task:quest_tasks!user_task_completions_task_id_fkey (
          title
        ),
        user:user_profiles!user_task_completions_user_id_fkey (
          id
        )
      `,
      )
      .eq("id", submissionId)
      .single();

    if (fetchError) throw fetchError;

    if (!currentSubmission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const now = new Date().toISOString();

    // Update the submission
    const updateData: any = {
      submission_status: status,
      admin_feedback: feedback?.trim() || null,
      reviewed_by: "admin", // Admin user since we're using withAdminAuth
      reviewed_at: now,
    };

    // If status is failed, ensure reward is not claimable
    if (status === "failed") {
      updateData.reward_claimed = false;
    }

    const { error: updateError } = await supabase
      .from("user_task_completions")
      .update(updateData)
      .eq("id", submissionId);

    if (updateError) throw updateError;

    // Create a notification for the user
    const notificationTitle = `Task submission reviewed: ${status}`;
    let notificationMessage = `Your submission for the task "${currentSubmission.task.title}" has been reviewed.`;

    if (status === "completed") {
      notificationMessage = `Congratulations! Your submission for "${currentSubmission.task.title}" has been approved. You can now claim your reward.`;
    } else if (status === "failed") {
      notificationMessage = `Your submission for "${currentSubmission.task.title}" was not approved. Please review the feedback and try again.`;
    } else if (status === "retry") {
      notificationMessage = `Your submission for "${currentSubmission.task.title}" needs some adjustments. Please review the feedback and resubmit.`;
    }

    const { error: notificationError } = await supabase
      .from("notifications")
      .insert({
        user_profile_id: currentSubmission.user.id,
        title: notificationTitle,
        message: notificationMessage,
        link: `/lobby/quests/${currentSubmission.quest_id}`,
      });

    if (notificationError) {
      log.error("Failed to create notification:", notificationError);
      // Don't fail the main operation if notification creation fails
    }

    // Recalculate quest progress for the user
    if (status === "completed" || status === "failed") {
      try {
        await supabase.rpc("recalculate_quest_progress", {
          p_user_id: currentSubmission.user_id,
          p_quest_id: currentSubmission.quest_id,
        });
      } catch (progressError) {
        log.error("Error recalculating progress:", progressError);
        // Don't fail the main operation if progress update fails
      }
    }

    return res.status(200).json({
      success: true,
      message: "Submission status updated successfully",
    });
  } catch (error: any) {
    log.error("Error updating submission status:", error);
    return res
      .status(500)
      .json({ error: "Failed to update submission status" });
  }
}

export default withAdminAuth(handler);
