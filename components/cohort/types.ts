/**
 * Interface for weekly content structure
 */
export interface WeeklyContent {
  week: number;
  title: string;
  description: string;
  topics: string[];
  deliverables: string[];
}

/**
 * Interface for cohort program details
 */
export interface CohortProgram {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  cost_usd: number;
  cost_naira: number;
  max_reward_dgt: number;
  features: string[];
  requirements: string[];
}

/**
 * Interface for cohort information
 */
export interface CohortInfo {
  id: string;
  name: string;
  start_date: string;
  registration_deadline: string;
  status: "open" | "closed" | "full";
  max_participants: number;
  current_participants: number;
}

/**
 * Props for WeeklyContentCard component
 */
export interface WeeklyContentCardProps {
  content: WeeklyContent;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * Props for ProgramOverview component
 */
export interface ProgramOverviewProps {
  program: CohortProgram;
  weeklyContent: WeeklyContent[];
}

/**
 * Props for CohortDetails component
 */
export interface CohortDetailsProps {
  program: CohortProgram;
  cohort: CohortInfo;
  weeklyContent: WeeklyContent[];
}

/**
 * Props for RegistrationCTA component
 */
export interface RegistrationCTAProps {
  cohortId: string;
  isRegistrationOpen: boolean;
  spotsRemaining: number;
  onRegister: () => void;
}
