import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database tables
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
