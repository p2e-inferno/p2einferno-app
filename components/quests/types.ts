export interface UserTaskCompletion {
  id: string;
  user_id: string;
  quest_id: string;
  task_id: string;
  verification_data: any;
  reward_claimed: boolean;
  completed_at: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  image_url?: string;
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

export interface TaskWithCompletion {
  task: QuestTask;
  completion: any;
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
  progress: number;
  isCompleted: boolean;
  tasksCompleted: number;
  totalTasks: number;
  canClaimReward?: boolean;
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
