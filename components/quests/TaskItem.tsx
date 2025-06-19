import React from "react";
import {
  Mail,
  Wallet,
  Share2,
  FileSignature,
  Circle,
  CheckCircle2,
  Coins,
} from "lucide-react";

// Define types for props. These should align with your actual data structures.
// Consider creating/importing shared types for Task and TaskCompletion if they exist.
interface Task {
  id: string;
  title: string;
  description: string;
  task_type: string; // e.g., "link_email", "link_wallet"
  reward_amount: number;
  order_index: number; // Or any other fields needed
}

interface TaskCompletion {
  id: string; // Completion record ID
  task_id: string;
  reward_claimed: boolean;
  // other completion details
}

interface TaskItemProps {
  task: Task;
  completion: TaskCompletion | undefined; // A task might not be completed yet
  isQuestStarted: boolean; // To enable/disable actions if quest isn't started
  onAction: (task: Task) => void; // Handler for completing a task
  onClaimReward: (completionId: string, amount: number) => void; // Handler for claiming reward
  processingTaskId: string | null; // ID of the task currently being processed (for loading states)
}

const getTaskIcon = (taskType: string, isCompleted: boolean): React.ReactNode => {
  const className = `w-8 h-8 ${isCompleted ? 'text-green-500' : 'text-gray-500'}`;
  const iconProps = { className: "w-6 h-6" } // For icons within the status circle

  let specificIcon: React.ReactNode;

  switch (taskType) {
    case "link_email":
      specificIcon = <Mail {...iconProps} />;
      break;
    case "link_wallet":
      specificIcon = <Wallet {...iconProps} />;
      break;
    case "link_farcaster":
      specificIcon = <Share2 {...iconProps} />;
      break;
    case "sign_tos":
      specificIcon = <FileSignature {...iconProps} />;
      break;
    default:
      specificIcon = <Circle {...iconProps} />; // Default icon for unknown task types
      break;
  }

  if (isCompleted) {
    return <CheckCircle2 className={className} />;
  } else {
    // Wrap the specific icon in a div to mimic the original structure if needed, or just return the icon
    return <div className={`mr-4 mt-1 ${className}`}>{specificIcon}</div>;
    // Original had a more complex structure for non-completed icons, adjust as needed.
    // For simplicity here, if not completed, we show the specific task type icon directly.
    // The original code in the page was:
    // <div className={`mr-4 mt-1 ${isCompleted ? "text-green-500" : "text-gray-500"}`}>
    //   {isCompleted ? <CheckCircle2 className="w-8 h-8" /> : <div className="relative">{getTaskIcon(task.task_type)}</div>}
    // </div>
    // The getTaskIcon in the page returned only the inner icon. This new one is more comprehensive.
  }
};


const TaskItem: React.FC<TaskItemProps> = ({
  task,
  completion,
  isQuestStarted,
  onAction,
  onClaimReward,
  processingTaskId,
}) => {
  const isCompleted = !!completion;
  const canClaim = isCompleted && !completion.reward_claimed;
  const isProcessing = processingTaskId === task.id || processingTaskId === completion?.id;

  const taskIcon = getTaskIcon(task.task_type, isCompleted);

  return (
    <div
      key={task.id}
      className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-6 border transition-all duration-300 ${
        isCompleted
          ? "border-green-500/50"
          : "border-gray-700 hover:border-orange-500/50"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start flex-1">
          {/* Task Status Icon - adjusted to use the new getTaskIcon logic */}
           {isCompleted ? <CheckCircle2 className="w-8 h-8 text-green-500 mr-4 mt-1" /> : <div className="mr-4 mt-1">{getTaskIcon(task.task_type, false)}</div>}


          {/* Task Info */}
          <div className="flex-1">
            <h3
              className={`text-xl font-bold mb-2 ${
                isCompleted ? "text-green-400" : "text-white"
              }`}
            >
              {task.title}
            </h3>
            <p className="text-gray-400 mb-4">{task.description}</p>

            {/* Task Actions */}
            {!isCompleted && isQuestStarted && (
              <button
                onClick={() => onAction(task)}
                disabled={isProcessing || !isQuestStarted}
                className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Processing..." : "Complete Task"}
              </button>
            )}

            {/* Claim Reward Button */}
            {canClaim && isQuestStarted && (
              <button
                onClick={() => onClaimReward(completion.id, task.reward_amount)}
                disabled={isProcessing || !isQuestStarted}
                className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-2 px-6 rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? "Claiming..." : `Claim ${task.reward_amount} DG`}
              </button>
            )}

            {/* Completed Status (and reward claimed) */}
            {isCompleted && !canClaim && (
              <div className="flex items-center text-green-400 mt-2">
                <CheckCircle2 className="w-5 h-5 mr-2" />
                <span className="font-semibold">
                  {completion.reward_claimed ? "Completed & Claimed" : "Completed"}
                  {/* Shows "Completed" if reward not claimed yet but `canClaim` is false for some reason (e.g. quest not started) */}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Reward Display */}
        <div className="ml-6 text-right">
          <div className="flex items-center text-yellow-400">
            <Coins className="w-5 h-5 mr-1" />
            <span className="font-bold text-lg">
              +{task.reward_amount} DG
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskItem;
