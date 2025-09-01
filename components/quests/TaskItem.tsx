import React, { useState } from "react";
import {
  Mail,
  Wallet,
  Share2,
  FileSignature,
  Circle,
  CheckCircle2,
  Coins,
  Link2,
  FileText,
  Camera,
  CheckCircle,
  Clock,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import type { QuestTask, UserTaskCompletion } from "@/lib/supabase/types";

interface Task extends QuestTask {
  // Extend QuestTask with any additional fields needed
}

interface TaskCompletion extends UserTaskCompletion {
  // Extend UserTaskCompletion with any additional fields needed
}

interface TaskItemProps {
  task: Task;
  completion: TaskCompletion | undefined; // A task might not be completed yet
  isQuestStarted: boolean; // To enable/disable actions if quest isn't started
  onAction: (task: Task, inputData?: any) => void; // Handler for completing a task
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
    case "submit_url":
      specificIcon = <Link2 {...iconProps} />;
      break;
    case "submit_text":
      specificIcon = <FileText {...iconProps} />;
      break;
    case "submit_proof":
      specificIcon = <Camera {...iconProps} />;
      break;
    case "complete_external":
      specificIcon = <CheckCircle {...iconProps} />;
      break;
    case "custom":
      specificIcon = <Circle {...iconProps} />;
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
  const [inputValue, setInputValue] = useState("");
  
  const isCompleted = !!completion && completion.submission_status === "completed";
  const isPending = !!completion && completion.submission_status === "pending";
  const isFailed = !!completion && completion.submission_status === "failed";
  const isRetry = !!completion && completion.submission_status === "retry";
  const canClaim = isCompleted && !completion.reward_claimed;
  const isProcessing = processingTaskId === task.id || processingTaskId === completion?.id;

  // Allow resubmission if status is retry or failed (for input-based tasks)
  const canResubmit = (isRetry || isFailed) && task.input_required;

  const handleTaskAction = () => {
    if (task.input_required) {
      if (inputValue.trim()) {
        onAction(task, inputValue.trim());
      } else {
        // Don't call onAction if input is required but empty
        // The error message will be shown in the UI
        return;
      }
    } else {
      onAction(task);
    }
  };

  const getStatusDisplay = () => {
    if (isPending) {
      return (
        <div className="flex items-center text-orange-400 mt-2">
          <Clock className="w-5 h-5 mr-2" />
          <span className="font-semibold">
            {task.requires_admin_review ? "Pending Review" : "Processing..."}
          </span>
        </div>
      );
    }
    
    if (isFailed) {
      return (
        <div className="mt-2">
          <div className="flex items-center text-red-400 mb-2">
            <XCircle className="w-5 h-5 mr-2" />
            <span className="font-semibold">Submission Failed</span>
          </div>
          {completion?.admin_feedback && (
            <div className="bg-red-900/20 border border-red-700 rounded p-3">
              <p className="text-red-300 text-sm">{completion.admin_feedback}</p>
            </div>
          )}
        </div>
      );
    }
    
    if (isRetry) {
      return (
        <div className="mt-2">
          <div className="flex items-center text-yellow-400 mb-2">
            <RotateCcw className="w-5 h-5 mr-2" />
            <span className="font-semibold">Retry Requested</span>
          </div>
          {completion?.admin_feedback && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3">
              <p className="text-yellow-300 text-sm">{completion.admin_feedback}</p>
            </div>
          )}
        </div>
      );
    }
    
    return null;
  };

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

            {/* Input Field for input-based tasks */}
            {task.input_required && (!isCompleted && !isPending) && isQuestStarted && (
              <div className="mb-4 space-y-2">
                <Label className="text-gray-300">
                  {task.input_label || "Your submission"}
                </Label>
                {task.input_validation === "textarea" ? (
                  <Textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={task.input_placeholder || "Enter your response..."}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                    rows={4}
                  />
                ) : (
                  <Input
                    type={task.input_validation === "number" ? "number" : 
                          task.input_validation === "email" ? "email" : 
                          task.input_validation === "url" ? "url" : "text"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={task.input_placeholder || "Enter here..."}
                    className="bg-gray-800 border-gray-700 text-gray-100"
                  />
                )}
              </div>
            )}

            {/* Task Actions */}
            {(!isCompleted && !isPending) && isQuestStarted && (
              <div className="space-y-2">
                <button
                  onClick={handleTaskAction}
                  disabled={isProcessing || !isQuestStarted || (task.input_required && !inputValue.trim())}
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing 
                    ? "Processing..." 
                    : canResubmit 
                      ? "Resubmit" 
                      : task.requires_admin_review 
                        ? "Submit for Review"
                        : "Complete Task"}
                </button>
                
                {/* Show validation message when input is required but missing */}
                {task.input_required && !inputValue.trim() && (
                  <p className="text-red-400 text-sm">
                    Please provide {task.input_label?.toLowerCase() || 'required information'} to continue
                  </p>
                )}
              </div>
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

            {/* Status Display */}
            {getStatusDisplay()}

            {/* Completed Status (and reward claimed) */}
            {isCompleted && !canClaim && (
              <div className="flex items-center text-green-400 mt-2">
                <CheckCircle2 className="w-5 h-5 mr-2" />
                <span className="font-semibold">
                  {completion?.reward_claimed ? "Completed & Claimed" : "Completed"}
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
