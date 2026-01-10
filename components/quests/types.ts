import type {
  Quest as SupabaseQuest,
  QuestTask as SupabaseQuestTask,
  UserQuestProgress as SupabaseUserQuestProgress,
  UserTaskCompletion as SupabaseUserTaskCompletion,
} from "@/lib/supabase/types";

export type Quest = SupabaseQuest;
export type QuestTask = SupabaseQuestTask;
export type UserQuestProgress = SupabaseUserQuestProgress;
export type UserTaskCompletion = SupabaseUserTaskCompletion;

export interface TaskWithCompletion {
  task: QuestTask;
  completion?: UserTaskCompletion;
  isCompleted: boolean;
  canClaim: boolean;
}

export interface QuestCardProps {
  quest: Quest;
  progress: number;
  isStarted: boolean;
  isCompleted: boolean;
}

export interface QuestHeaderProps {
  quest: Quest;
  progressPercentage: number;
  isQuestCompleted: boolean;
  isQuestStarted: boolean;
  tasksCompletedCount: number;
  totalTasksCount: number;
  onStartQuest?: () => void;
  isLoadingStartQuest?: boolean;
  canStartQuest?: boolean;
  canClaimReward?: boolean;
  hasClaimedReward?: boolean;
  onClaimReward?: () => void;
  isClaimingReward?: boolean;
}

export interface TaskCardProps {
  taskData: TaskWithCompletion;
  index: number;
  isProcessing: boolean;
  onComplete: () => void;
}

export interface QuestListProps {
  quests: Quest[];
  userProgress: UserQuestProgress[];
  completedTasks: UserTaskCompletion[];
  loading: boolean;
  error: string | null;
  getQuestCompletionPercentage: (quest: Quest) => number;
}
