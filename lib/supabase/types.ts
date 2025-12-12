/**
 * Database types for Supabase tables
 *
 * These types should match your Supabase database schema.
 * Consider using `supabase gen types typescript` to auto-generate these.
 */

export interface BootcampProgram {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  max_reward_dgt: number;
  lock_address?: string;
  lock_manager_granted?: boolean;
  grant_failure_reason?: string;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Cohort {
  id: string;
  bootcamp_program_id: string;
  name: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  current_participants: number;
  registration_deadline: string;
  status: "open" | "closed" | "upcoming";
  lock_address?: string;
  lock_manager_granted?: boolean;
  grant_failure_reason?: string;
  key_managers?: string[];
  usdt_amount?: number;
  naira_amount?: number;
  created_at: string;
  updated_at: string;
}

export interface CohortMilestone {
  id: string;
  cohort_id: string;
  name: string;
  description: string;
  order_index: number;
  start_date?: string;
  end_date?: string;
  lock_address: string;
  lock_manager_granted?: boolean;
  grant_failure_reason?: string;
  prerequisite_milestone_id?: string;
  duration_hours?: number;
  total_reward?: number;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  cohort_id: string;
  user_email: string;
  user_name: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  motivation: string;
  goals: string[];
  payment_status: "pending" | "completed" | "failed";
  application_status: "draft" | "submitted" | "approved" | "rejected";
  discount_code?: string;
  total_amount?: number;
  currency?: "NGN" | "USD";
  payment_method: "crypto" | "fiat";
  created_at: string;
  updated_at: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  image_url?: string;
  total_reward: number;
  is_active: boolean;
  lock_address?: string;
  lock_manager_granted?: boolean;
  grant_failure_reason?: string;
  prerequisite_quest_id?: string | null;
  prerequisite_quest_lock_address?: string | null;
  requires_prerequisite_key?: boolean;
  reward_type: "xdg" | "activation";
  activation_type?: "dg_trial" | null;
  activation_config?: {
    lockAddress?: string;
    trialDurationSeconds?: number;
    keyManager?: string;
  } | null;
  created_at: string;
  updated_at: string;
  quest_tasks: QuestTask[];
  can_start?: boolean;
  prerequisite_state?: "none" | "missing_completion" | "missing_key" | "ok";
  requires_gooddollar_verification?: boolean;
}

export type TaskType =
  | "link_email"
  | "link_wallet"
  | "link_farcaster"
  | "sign_tos"
  | "submit_url"
  | "submit_text"
  | "submit_proof"
  | "complete_external"
  | "custom"
  | "vendor_buy"
  | "vendor_sell"
  | "vendor_light_up"
  | "vendor_level_up";

export type InputValidationType =
  | "url"
  | "text"
  | "email"
  | "number"
  | "textarea";

export interface QuestTask {
  id: string;
  quest_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  verification_method: string;
  reward_amount: number;
  order_index: number;
  input_required?: boolean;
  input_label?: string;
  input_placeholder?: string;
  input_validation?: InputValidationType;
  requires_admin_review?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserQuestProgress {
  id: string;
  user_id: string;
  quest_id: string;
  tasks_completed: number;
  is_completed: boolean;
  reward_claimed: boolean;
  created_at: string;
  updated_at: string;
}

export type SubmissionStatus = "pending" | "completed" | "failed" | "retry";

export interface UserTaskCompletion {
  id: string;
  user_id: string;
  quest_id: string;
  task_id: string;
  verification_data: any;
  submission_data?: any;
  submission_status?: SubmissionStatus;
  admin_feedback?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  reward_claimed: boolean;
  completed_at: string;
}

export interface MilestoneTask {
  id: string;
  milestone_id: string;
  title: string;
  description?: string;
  reward_amount: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  user_id: string;
  submission_url: string;
  status: "pending" | "completed" | "failed" | "retry";
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  feedback?: string;
  created_at: string;
  updated_at: string;
}

export interface ProgramHighlight {
  id: string;
  cohort_id: string;
  content: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface ProgramRequirement {
  id: string;
  cohort_id: string;
  content: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface UserMilestoneProgress {
  id: string;
  user_profile_id: string;
  milestone_id: string;
  status: "not_started" | "in_progress" | "completed" | "expired";
  tasks_completed: number;
  total_tasks: number;
  progress_percentage: number;
  started_at?: string;
  completed_at?: string;
  reward_claimed: boolean;
  reward_amount: number;
  created_at: string;
  updated_at: string;
}

export interface UserTaskProgress {
  id: string;
  user_profile_id: string;
  milestone_id: string;
  task_id: string;
  status: "not_started" | "in_progress" | "completed" | "failed" | "expired";
  submission_id?: string;
  completed_at?: string;
  reward_claimed: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnhancedMilestoneTask extends MilestoneTask {
  task_type:
  | "file_upload"
  | "url_submission"
  | "contract_interaction"
  | "text_submission"
  | "external_verification";
  submission_requirements?: any;
  validation_criteria?: any;
  requires_admin_review: boolean;
}

export interface EnhancedTaskSubmission extends TaskSubmission {
  submission_data?: any;
  submission_type: string;
  file_urls?: string[];
  submission_metadata?: any;
}

export interface BootcampWithCohorts {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  max_reward_dgt: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
  // Optional enrollment-aware flags provided by API routes
  enrolled_in_bootcamp?: boolean;
  enrolled_cohort_id?: string;
  cohorts: Array<
    Cohort & {
      is_enrolled?: boolean;
      user_enrollment_id?: string;
    }
  >;
}

export interface Enrollment {
  id: string;
  user_profile_id: string;
  cohort_id: string;
  enrollment_status: "enrolled" | "completed" | "dropped" | "suspended";
  progress: {
    modules_completed: number;
    total_modules: number;
  };
  completion_date?: string;
  certificate_issued: boolean;
  created_at: string;
  updated_at: string;
  cohort?: {
    id: string;
    name: string;
    bootcamp_program_id: string;
    start_date: string;
    end_date: string;
  };
}
