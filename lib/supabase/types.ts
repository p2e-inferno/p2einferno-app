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
  cost_naira: number;
  cost_usd: number;
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
  total_reward: number;
  is_active: boolean;
  created_at: string;
  quest_tasks: QuestTask[];
}

export interface QuestTask {
  id: string;
  quest_id: string;
  title: string;
  description: string;
  task_type: "link_email" | "link_wallet" | "link_farcaster" | "sign_tos";
  verification_method: string;
  reward_amount: number;
  order_index: number;
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

export interface UserTaskCompletion {
  id: string;
  user_id: string;
  quest_id: string;
  task_id: string;
  verification_data: any;
  reward_claimed: boolean;
  completed_at: string;
} 