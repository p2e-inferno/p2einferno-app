import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./mailgun";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("email:helpers");

export interface PaymentEmailContext {
  email: string;
  cohortName: string;
  amount?: number;
  currency?: string;
}

/**
 * Fetch email context for payment-related emails.
 * Returns null if user email is missing or invalid.
 */
export async function getPaymentEmailContext(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<PaymentEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("user_email, cohort:cohort_id ( name )")
      .eq("id", applicationId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch payment email context", { applicationId, error });
      return null;
    }

    const email = normalizeEmail(data.user_email);
    if (!email) {
      log.warn("No valid email for application", { applicationId });
      return null;
    }

    const cohort = Array.isArray(data.cohort) ? data.cohort[0] : data.cohort;

    return {
      email,
      cohortName: cohort?.name || "Bootcamp",
    };
  } catch (err) {
    log.error("Exception fetching payment email context", { applicationId, err });
    return null;
  }
}

export interface UserEmailContext {
  email: string;
  displayName?: string;
}

/**
 * Fetch user email from profile by privy_user_id.
 */
export async function getUserEmailContext(
  supabase: SupabaseClient,
  privyUserId: string,
): Promise<UserEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("privy_user_id", privyUserId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch user email context", { privyUserId, error });
      return null;
    }

    const email = normalizeEmail(data.email);
    if (!email) return null;

    return {
      email,
      displayName: data.display_name,
    };
  } catch (err) {
    log.error("Exception fetching user email context", { privyUserId, err });
    return null;
  }
}

/**
 * Fetch user email from profile by user_profile_id (UUID).
 */
export async function getUserEmailContextById(
  supabase: SupabaseClient,
  userProfileId: string,
): Promise<UserEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("id", userProfileId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch user email by profile ID", { userProfileId, error });
      return null;
    }

    const email = normalizeEmail(data.email);
    if (!email) return null;

    return {
      email,
      displayName: data.display_name,
    };
  } catch (err) {
    log.error("Exception fetching user email by profile ID", { userProfileId, err });
    return null;
  }
}

export interface SubmissionReviewContext {
  /**
   * System-specific submission identifier.
   * - milestone: task_submissions.id
   * - quest: user_task_completions.id
   */
  submissionId?: string;
  /**
   * A stable, attempt-unique key suitable for email deduplication.
   * For quests, this should change on resubmissions (e.g. completed_at timestamp).
   */
  submissionAttemptKey?: string;
  taskId: string;
  taskTitle: string;
  userName: string;
  submissionType: string;
  systemType: "milestone" | "quest";
}

/**
 * Fetch submission context for milestone task submissions.
 * Returns null if submission, task, or user not found.
 */
export async function getMilestoneSubmissionContext(
  supabase: SupabaseClient,
  submissionId: string,
  userId: string,
): Promise<SubmissionReviewContext | null> {
  try {
    // Fetch submission with task (has FK relationship)
    const { data, error } = await supabase
      .from("task_submissions")
      .select(
        `
        id,
        submission_type,
        task_id,
        user_id,
        task:milestone_tasks!task_id (
          id,
          title
        )
      `,
      )
      .eq("id", submissionId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch milestone submission context", {
        submissionId,
        userId,
        error,
      });
      return null;
    }

    const task = Array.isArray(data.task) ? data.task[0] : data.task;

    if (!task) {
      log.warn("Task not found for milestone submission", { submissionId });
      return null;
    }

    // Fetch user profile separately (no FK relationship from task_submissions to user_profiles)
    const { data: userProfile, error: userError } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("privy_user_id", data.user_id)
      .maybeSingle();

    if (userError || !userProfile) {
      log.warn("Failed to fetch user profile for milestone submission", {
        userId: data.user_id,
        error: userError,
      });
      return null;
    }

    return {
      submissionId: data.id,
      submissionAttemptKey: data.id,
      taskId: data.task_id,
      taskTitle: task.title,
      userName: userProfile.display_name || "User",
      submissionType: data.submission_type,
      systemType: "milestone",
    };
  } catch (err) {
    log.error("Exception fetching milestone submission context", {
      submissionId,
      userId,
      err,
    });
    return null;
  }
}

/**
 * Fetch submission context for quest task submissions.
 * Returns null if task or user not found.
 */
export async function getQuestSubmissionContext(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
): Promise<SubmissionReviewContext | null> {
  try {
    const { data: task, error: taskError } = await supabase
      .from("quest_tasks")
      .select("id, title, task_type")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      log.warn("Failed to fetch quest task", { taskId, error: taskError });
      return null;
    }

    const { data: user, error: userError } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("privy_user_id", userId)
      .maybeSingle();

    if (userError || !user) {
      log.warn("Failed to fetch user profile for quest", {
        userId,
        error: userError,
      });
      return null;
    }

    const { data: completion, error: completionError } = await supabase
      .from("user_task_completions")
      .select("id, completed_at")
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle();

    if (completionError) {
      log.warn("Failed to fetch quest completion for dedup", {
        taskId,
        userId,
        error: completionError,
      });
    }

    const submissionId = completion?.id;
    const submissionAttemptKey = completion?.completed_at || completion?.id;

    return {
      submissionId,
      submissionAttemptKey,
      taskId: task.id,
      taskTitle: task.title,
      userName: user.display_name || "User",
      submissionType: task.task_type,
      systemType: "quest",
    };
  } catch (err) {
    log.error("Exception fetching quest submission context", {
      taskId,
      userId,
      err,
    });
    return null;
  }
}
