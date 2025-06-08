/**
 * Interface for bootcamp data used across apply components
 */
export interface BootcampProgram {
  id: string;
  name: string;
  description: string;
  cost_usd: number;
  cost_naira: number;
  duration_weeks: number;
  max_reward_dgt: number;
  start_date: string;
  registration_deadline: string;
  status: "open" | "closed";
  max_participants: number;
  current_participants: number;
}

/**
 * Interface for cohort information
 */
export interface Cohort {
  id: string;
  name: string;
  start_date: string;
  registration_deadline: string;
  status: "open" | "closed";
  max_participants: number;
  current_participants: number;
}

/**
 * Interface for application form data
 */
export interface ApplicationFormData {
  user_name: string;
  user_email: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  motivation: string;
  goals: string[];
}

/**
 * Interface for application steps
 */
export interface ApplicationStep {
  id: string;
  title: string;
  description: string;
}

/**
 * Interface for experience levels
 */
export interface ExperienceLevel {
  value: "beginner" | "intermediate" | "advanced";
  label: string;
  description: string;
}

/**
 * Props for BootcampCard component
 */
export interface BootcampCardProps {
  program: BootcampProgram;
  cohort: Cohort;
  isRegistrationOpen: boolean;
  timeRemaining: string;
  spotsRemaining: number;
}

/**
 * Props for ApplicationForm component
 */
export interface ApplicationFormProps {
  cohortId: string;
  onSubmitSuccess?: (data: any) => void;
}

/**
 * Props for PaymentForm component
 */
export interface PaymentFormProps {
  applicationId: string;
  totalAmount: number;
  onPaymentSuccess?: () => void;
}

/**
 * Props for CohortHero component
 */
export interface CohortHeroProps {
  program: BootcampProgram;
  cohort: Cohort;
  timeRemaining: string;
  spotsRemaining: number;
  onBeginApplication: () => void;
}
