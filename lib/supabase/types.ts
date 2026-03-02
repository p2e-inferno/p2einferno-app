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
  max_keys_secured?: boolean | null;
  max_keys_failure_reason?: string | null;
  transferability_secured?: boolean | null;
  transferability_failure_reason?: string | null;
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
  transferability_secured?: boolean | null;
  transferability_failure_reason?: string | null;
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
  max_keys_secured?: boolean | null;
  max_keys_failure_reason?: string | null;
  transferability_secured?: boolean | null;
  transferability_failure_reason?: string | null;
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
  max_keys_secured?: boolean | null;
  max_keys_failure_reason?: string | null;
  transferability_secured?: boolean | null;
  transferability_failure_reason?: string | null;
  prerequisite_quest_id?: string | null;
  prerequisite_quest?: { id: string; title: string } | null;
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
  | "link_telegram"
  | "link_discord"
  | "link_x"
  | "link_github"
  | "link_tiktok"
  | "sign_tos"
  | "submit_url"
  | "submit_text"
  | "submit_proof"
  | "complete_external"
  | "custom"
  | "vendor_buy"
  | "vendor_sell"
  | "vendor_light_up"
  | "vendor_level_up"
  | "deploy_lock"
  | "uniswap_swap"
  | "daily_checkin";

export type InputValidationType =
  | "url"
  | "text"
  | "email"
  | "number"
  | "textarea"
  | "file";

export interface QuestTask {
  id: string;
  quest_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  verification_method: string;
  reward_amount: number;
  order_index: number;
  task_config?: Record<string, unknown> | null;
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
  requires_admin_review?: boolean;
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

export interface UniswapSwapTaskConfig {
  pair: import("@/lib/uniswap/types").SwapPair;
  direction: import("@/lib/uniswap/types").SwapDirection;
  /** Base-10 integer string in raw token units (wei for ETH/UP, 6-decimal units for USDC) */
  required_amount_in: string;
}

export interface DailyQuestTemplate {
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
  /**
   * Template completion bonus (admin-defined). Awarded only after a successful daily completion key claim.
   * Not derived from individual task reward_amount fields.
   */
  completion_bonus_reward_amount: number;
  is_active: boolean;
  lock_address?: string | null;
  lock_manager_granted: boolean;
  grant_failure_reason?: string | null;
  /**
   * JSONB stored on daily_quest_templates. Keys use snake_case to match existing task_config conventions.
   * All fields optional and independently combinable.
   */
  eligibility_config: {
    min_vendor_stage?: number;
    requires_gooddollar_verification?: boolean;
    required_lock_address?: string;
    required_erc20?: { token: string; min_balance: string };
  };
  created_at: string;
  updated_at: string;
  daily_quest_tasks?: DailyQuestTask[];
}

export interface DailyQuestTask {
  id: string;
  daily_quest_template_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  verification_method: string;
  reward_amount: number;
  order_index: number;
  task_config?: Record<string, unknown> | null;
  input_required?: boolean;
  input_label?: string;
  input_placeholder?: string;
  input_validation?: InputValidationType;
  requires_admin_review?: boolean;
}

export interface DailyQuestRun {
  id: string;
  daily_quest_template_id: string;
  run_date: string; // YYYY-MM-DD
  starts_at: string;
  ends_at: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
}

export interface DailyQuestRunTask {
  id: string;
  daily_quest_run_id: string;
  daily_quest_template_task_id?: string | null;
  title: string;
  description: string;
  task_type: TaskType;
  verification_method: string;
  reward_amount: number;
  order_index: number;
  task_config: Record<string, unknown>;
  input_required?: boolean;
  input_label?: string | null;
  input_placeholder?: string | null;
  input_validation?: InputValidationType | null;
  requires_admin_review?: boolean;
}

export interface UserDailyQuestProgress {
  id: string;
  user_id: string;
  daily_quest_run_id: string;
  started_at: string;
  completed_at?: string | null;
  reward_claimed: boolean;
  key_claim_tx_hash?: string | null;
  key_claim_token_id?: string | number | null;
  completion_bonus_claimed: boolean;
  completion_bonus_amount: number;
  completion_bonus_claimed_at?: string | null;
  updated_at: string;
}

export interface UserDailyTaskCompletion {
  id: string;
  user_id: string;
  daily_quest_run_id: string;
  daily_quest_run_task_id: string;
  completed_at: string;
  verification_data?: any;
  submission_data?: any;
  submission_status?: SubmissionStatus;
  reward_claimed: boolean;
  updated_at: string;
}
