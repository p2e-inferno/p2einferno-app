import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Mail,
  Wallet,
  Share2,
  Flame,
  TrendingUp,
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
  Network,
  Upload,
  X,
  MessageCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DeployLockTaskForm } from "./DeployLockTaskForm";
import { RichText } from "@/components/common/RichText";
import { validateFile } from "@/lib/utils/validation";
import { isValidTransactionHash } from "@/lib/quests/txHash";
import { isVendorTxTaskType } from "@/lib/quests/vendorTaskTypes";

import type { QuestTask, UserTaskCompletion } from "@/lib/supabase/types";
import type { DeployLockTaskConfig } from "@/lib/quests/verification/deploy-lock-utils";

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
  questId: string; // Quest ID for deploy_lock task submissions
  onAction: (task: Task, inputData?: any) => void; // Handler for completing a task
  onClaimReward: (completionId: string, amount: number) => void; // Handler for claiming reward
  processingTaskId: string | null; // ID of the task currently being processed (for loading states)
}

const getTaskIcon = (
  taskType: string,
  isCompleted: boolean,
): React.ReactNode => {
  const className = `w-8 h-8 ${isCompleted ? "text-green-500" : "text-gray-500"}`;
  const iconProps = { className: "w-6 h-6" }; // For icons within the status circle

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
    case "link_telegram":
      specificIcon = <MessageCircle {...iconProps} />;
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
    case "deploy_lock":
      specificIcon = <Network {...iconProps} />;
      break;
    case "vendor_buy":
    case "vendor_sell":
      specificIcon = <Coins {...iconProps} />;
      break;
    case "vendor_light_up":
      specificIcon = <Flame {...iconProps} />;
      break;
    case "vendor_level_up":
      specificIcon = <TrendingUp {...iconProps} />;
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
  questId,
  onAction,
  onClaimReward,
  processingTaskId,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [txHashInput, setTxHashInput] = useState("");
  const [txHashTouched, setTxHashTouched] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isFileUpload = task.input_validation === "file";
  const hasDeployLockForm =
    task.task_type === "deploy_lock" &&
    !!task.task_config &&
    typeof task.task_config === "object";
  const requiresTxHashInput =
    isVendorTxTaskType(task.task_type) ||
    (task.task_type === "deploy_lock" && !hasDeployLockForm);
  const hasValidTxHash = isValidTransactionHash(txHashInput);
  const verificationTxHash = useMemo(() => {
    const verificationData = completion?.verification_data as
      | { txHash?: string }
      | null
      | undefined;
    return typeof verificationData?.txHash === "string"
      ? verificationData.txHash
      : null;
  }, [completion?.verification_data]);

  const isCompleted =
    !!completion && completion.submission_status === "completed";
  const isPending = !!completion && completion.submission_status === "pending";
  const isFailed = !!completion && completion.submission_status === "failed";
  const isRetry = !!completion && completion.submission_status === "retry";
  const canClaim = isCompleted && !completion.reward_claimed;
  const isProcessing =
    processingTaskId === task.id || processingTaskId === completion?.id;

  // Allow editing/resubmission for tasks that require user-provided proof.
  const canEdit =
    (isPending || isRetry || isFailed) &&
    (task.input_required || requiresTxHashInput);

  // Reset form state when task changes
  useEffect(() => {
    setInputValue("");
    setTxHashInput("");
    setTxHashTouched(false);
    setUploadedFileUrl(null);
    setUploadedFileName(null);
    setImagePreview(null);
  }, [task.id]);

  // Pre-populate form with existing submission data when editing
  useEffect(() => {
    if (canEdit && completion?.submission_data) {
      const submissionData = completion.submission_data;
      if (isFileUpload) {
        // For file uploads, submission_data is the file URL
        if (typeof submissionData === "string") {
          setUploadedFileUrl(submissionData);
          setUploadedFileName("Previously uploaded file");

          // Show preview for image URLs
          if (submissionData.match(/\.(jpe?g|png|gif|webp)(\?|$)/i)) {
            setImagePreview(submissionData);
          }
        }
      } else {
        // For text inputs, submission_data is the text value
        if (typeof submissionData === "string") {
          setInputValue(submissionData);
        }
      }
    }
  }, [canEdit, completion?.submission_data, isFileUpload, task.id]);

  // Pre-populate tx hash for tx-based vendor tasks during resubmission flows.
  useEffect(() => {
    if (!canEdit || !requiresTxHashInput) return;
    const fromVerification = verificationTxHash;
    const fromSubmission =
      typeof completion?.submission_data === "string"
        ? completion.submission_data
        : null;
    const existingHash = (fromVerification || fromSubmission || "").trim();
    if (existingHash) {
      setTxHashInput(existingHash);
    }
  }, [
    canEdit,
    requiresTxHashInput,
    completion?.id,
    verificationTxHash,
    completion?.submission_data,
    task.id,
  ]);

  const handleFileUpload = async (file: File) => {
    // Client-side validation before expensive operations
    const validation = validateFile(file);
    if (!validation.isValid) {
      toast.error(validation.error || "Invalid file");
      setImagePreview(null);
      return;
    }

    try {
      setUploading(true);

      // Read file once as data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Set image preview if applicable
      if (file.type.startsWith("image/")) {
        setImagePreview(dataUrl);
      }

      const base64 = dataUrl.split(",")[1] || "";
      const resp = await fetch(`/api/user/task/${task.id}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: base64,
          fileName: file.name,
          contentType: file.type,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadedFileUrl(data.url);
      setUploadedFileName(file.name);
      toast.success("File uploaded successfully!");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload file";
      toast.error(errorMessage);
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone itself, not a child element
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const clearUpload = () => {
    setUploadedFileUrl(null);
    setUploadedFileName(null);
    setImagePreview(null);
  };

  const handleTaskAction = () => {
    if (requiresTxHashInput) {
      const txHash = txHashInput.trim();
      if (!hasValidTxHash) {
        toast.error("Please provide a valid transaction hash");
        return;
      }
      onAction(task, txHash);
      return;
    }

    if (task.input_required) {
      if (isFileUpload) {
        if (uploadedFileUrl) {
          onAction(task, uploadedFileUrl);
        } else {
          toast.error("Please upload a file first");
          return;
        }
      } else if (inputValue.trim()) {
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
              <p className="text-red-300 text-sm">
                {completion.admin_feedback}
              </p>
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
              <p className="text-yellow-300 text-sm">
                {completion.admin_feedback}
              </p>
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
      className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-4 sm:p-6 border transition-all duration-300 ${
        isCompleted
          ? "border-green-500/50"
          : "border-gray-700 hover:border-orange-500/50"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-start flex-1 min-w-0">
          {/* Task Status Icon - adjusted to use the new getTaskIcon logic */}
          {isCompleted ? (
            <CheckCircle2 className="w-8 h-8 text-green-500 mr-4 mt-1" />
          ) : (
            getTaskIcon(task.task_type, false)
          )}

          {/* Task Info */}
          <div className="flex-1 min-w-0">
            <h3
              className={`text-xl font-bold mb-2 ${
                isCompleted ? "text-green-400" : "text-white"
              }`}
            >
              <span className="break-words">{task.title}</span>
            </h3>
            <RichText
              content={task.description}
              className="text-gray-400 mb-4 break-words"
            />

            {/* Deploy Lock Task Form */}
            {task.task_type === "deploy_lock" &&
              !isCompleted &&
              !isPending &&
              isQuestStarted &&
              hasDeployLockForm && (
                <div className="mb-4">
                  <DeployLockTaskForm
                    taskId={task.id}
                    questId={questId}
                    taskConfig={
                      task.task_config as unknown as DeployLockTaskConfig
                    }
                    baseReward={task.reward_amount}
                    isCompleted={isCompleted}
                    isQuestStarted={isQuestStarted}
                    onSubmit={async (txHash) => {
                      onAction(task, { transactionHash: txHash });
                    }}
                  />
                </div>
              )}

            {/* Input Field for input-based tasks */}
            {requiresTxHashInput && !isCompleted && isQuestStarted && (
              <div className="mb-4 space-y-2">
                <Label htmlFor={`tx-hash-${task.id}`} className="text-gray-300">
                  Transaction Hash
                </Label>
                <Input
                  id={`tx-hash-${task.id}`}
                  type="text"
                  value={txHashInput}
                  onChange={(e) => {
                    setTxHashInput(e.target.value);
                    setTxHashTouched(true);
                  }}
                  onBlur={() => setTxHashTouched(true)}
                  placeholder="0x..."
                  className="bg-gray-800 border-gray-700 text-gray-100 font-mono"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            )}

            {/* Input Field for input-based tasks */}
            {task.input_required &&
              !requiresTxHashInput &&
              task.task_type !== "deploy_lock" &&
              !isCompleted &&
              isQuestStarted && (
                <div className="mb-4 space-y-2">
                  <Label className="text-gray-300">
                    {task.input_label || "Your submission"}
                  </Label>
                  {isFileUpload ? (
                    // File Upload UI
                    <div className="space-y-3">
                      {!uploadedFileUrl ? (
                        <div
                          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                            uploading
                              ? "border-orange-500/50 bg-orange-500/10"
                              : isDragging
                                ? "border-orange-500 bg-orange-500/20"
                                : "border-gray-600 hover:border-orange-500/50 hover:bg-gray-800/50"
                          }`}
                          onClick={() =>
                            !uploading &&
                            document
                              .getElementById(`file-input-${task.id}`)
                              ?.click()
                          }
                          onDragOver={handleDragOver}
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          <input
                            id={`file-input-${task.id}`}
                            type="file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file);
                            }}
                            disabled={uploading}
                            className="hidden"
                            accept="image/*,application/pdf"
                          />
                          {uploading ? (
                            <div className="flex flex-col items-center space-y-2">
                              <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                              <p className="text-gray-400">Uploading...</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center space-y-2">
                              <Upload className="w-8 h-8 text-gray-500" />
                              <p className="text-gray-400">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-xs text-gray-500">
                                Images and PDFs (max 2MB)
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              {imagePreview ? (
                                <Image
                                  src={imagePreview}
                                  alt="Preview"
                                  width={48}
                                  height={48}
                                  className="w-12 h-12 object-cover rounded"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-12 h-12 bg-green-500/20 rounded flex items-center justify-center">
                                  <Upload className="w-6 h-6 text-green-400" />
                                </div>
                              )}
                              <div>
                                <p className="text-green-400 font-medium">
                                  {uploadedFileName}
                                </p>
                                <p className="text-xs text-gray-400">
                                  Ready to submit
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={clearUpload}
                              className="p-1 hover:bg-gray-700 rounded transition-colors"
                            >
                              <X className="w-5 h-5 text-gray-400 hover:text-white" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : task.input_validation === "textarea" ? (
                    <Textarea
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={
                        task.input_placeholder || "Enter your response..."
                      }
                      className="bg-gray-800 border-gray-700 text-gray-100"
                      rows={4}
                    />
                  ) : (
                    <Input
                      type={
                        task.input_validation === "number"
                          ? "number"
                          : task.input_validation === "email"
                            ? "email"
                            : task.input_validation === "url"
                              ? "url"
                              : "text"
                      }
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={task.input_placeholder || "Enter here..."}
                      className="bg-gray-800 border-gray-700 text-gray-100"
                    />
                  )}
                </div>
              )}

            {/* Task Actions */}
            {!isCompleted && isQuestStarted && (
              <div className="space-y-2">
                <button
                  onClick={handleTaskAction}
                  disabled={
                    isProcessing ||
                    uploading ||
                    !isQuestStarted ||
                    (requiresTxHashInput && !hasValidTxHash) ||
                    (task.input_required &&
                      (isFileUpload ? !uploadedFileUrl : !inputValue.trim()))
                  }
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing
                    ? "Processing..."
                    : isPending
                      ? "Update Submission"
                      : isRetry || isFailed
                        ? "Resubmit"
                        : task.requires_admin_review
                          ? "Submit for Review"
                          : "Complete Task"}
                </button>

                {/* Show validation message when input is required but missing */}
                {task.input_required &&
                  !requiresTxHashInput &&
                  (isFileUpload ? !uploadedFileUrl : !inputValue.trim()) && (
                    <p className="text-red-400 text-sm">
                      {isFileUpload
                        ? "Please upload a file to continue"
                        : `Please provide ${task.input_label?.toLowerCase() || "required information"} to continue`}
                    </p>
                  )}

                {requiresTxHashInput && !hasValidTxHash && txHashTouched && (
                  <p className="text-red-400 text-sm">
                    Please provide a valid transaction hash to continue
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
                {isProcessing
                  ? "Claiming..."
                  : `Claim ${task.reward_amount} DG`}
              </button>
            )}

            {/* Status Display */}
            {getStatusDisplay()}

            {/* Completed Status (and reward claimed) */}
            {isCompleted && !canClaim && (
              <div className="flex items-center text-green-400 mt-2">
                <CheckCircle2 className="w-5 h-5 mr-2" />
                <span className="font-semibold">
                  {completion?.reward_claimed
                    ? "Completed & Claimed"
                    : "Completed"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Reward Display */}
        <div className="sm:ml-6 text-left sm:text-right mt-2 sm:mt-0 self-stretch sm:self-auto">
          <div className="inline-flex items-center text-yellow-400 whitespace-nowrap">
            <Coins className="w-5 h-5 mr-1 flex-shrink-0" />
            <span className="font-bold text-base sm:text-lg">
              +{task.reward_amount} DG
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskItem;
