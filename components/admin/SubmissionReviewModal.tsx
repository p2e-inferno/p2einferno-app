import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, CheckCircle, XCircle, RotateCcw, AlertCircle } from "lucide-react";
import type { SubmissionStatus } from "@/lib/supabase/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:SubmissionReviewModal");

interface SubmissionReviewModalProps {
  submission: {
    id: string;
    user_id: string;
    task_id: string;
    submission_data: any;
    verification_data?: any;
    submission_status?: SubmissionStatus;
    admin_feedback?: string;
    completed_at: string;
    task: {
      id: string;
      title: string;
      task_type: string;
    };
    user: {
      id: string;
      email?: string;
      wallet_address?: string;
      display_name?: string;
    };
  };
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (
    submissionId: string,
    newStatus: SubmissionStatus,
    feedback?: string,
  ) => Promise<void>;
}

const statusOptions = [
  {
    value: "completed" as SubmissionStatus,
    label: "Approve",
    icon: CheckCircle,
    color: "bg-green-600 hover:bg-green-700",
    description: "User gets reward and task is marked complete",
  },
  {
    value: "failed" as SubmissionStatus,
    label: "Reject",
    icon: XCircle,
    color: "bg-red-600 hover:bg-red-700",
    description: "Task is marked as failed, no reward",
  },
  {
    value: "retry" as SubmissionStatus,
    label: "Request Retry",
    icon: RotateCcw,
    color: "bg-yellow-600 hover:bg-yellow-700",
    description: "User can resubmit with your feedback",
  },
];

export default function SubmissionReviewModal({
  submission,
  isOpen,
  onClose,
  onStatusUpdate,
}: SubmissionReviewModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<SubmissionStatus | null>(
    null,
  );
  const [feedback, setFeedback] = useState(submission.admin_feedback || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleStatusUpdate = async () => {
    if (!selectedStatus) return;

    setIsSubmitting(true);
    try {
      await onStatusUpdate(submission.id, selectedStatus, feedback);
    } catch (error) {
      log.error("Error updating status:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSubmissionData = (data: any) => {
    if (!data) return "No submission data";

    if (typeof data === "string") {
      return data;
    }

    if (typeof data === "object") {
      // Handle different data structures
      if (data.url) return data.url;
      if (data.text) return data.text;
      if (data.response) return data.response;
      return JSON.stringify(data, null, 2);
    }

    return String(data);
  };

  const isUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const submissionText = formatSubmissionData(submission.submission_data);
  const verificationData =
    submission.verification_data &&
    typeof submission.verification_data === "object" &&
    !Array.isArray(submission.verification_data)
      ? (submission.verification_data as Record<string, unknown>)
      : null;
  const isAIVerification =
    verificationData &&
    (verificationData.verificationMethod === "ai" ||
      typeof verificationData.aiDecision === "string" ||
      typeof verificationData.aiModel === "string" ||
      typeof verificationData.aiReason === "string");
  const aiDecision =
    verificationData && typeof verificationData.aiDecision === "string"
      ? verificationData.aiDecision
      : null;
  const aiConfidence =
    verificationData && typeof verificationData.aiConfidence === "number"
      ? verificationData.aiConfidence
      : null;
  const aiReason =
    verificationData && typeof verificationData.aiReason === "string"
      ? verificationData.aiReason
      : null;
  const aiModel =
    verificationData && typeof verificationData.aiModel === "string"
      ? verificationData.aiModel
      : null;
  const aiVerifiedAt =
    verificationData && typeof verificationData.verifiedAt === "string"
      ? verificationData.verifiedAt
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h3 className="text-xl font-semibold text-white">
            Review Submission
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            disabled={isSubmitting}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {/* User Info */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="font-medium text-white mb-2">User Information</h4>
            <div className="space-y-1 text-sm">
              <p className="text-gray-300">
                <span className="text-gray-400">Name:</span>{" "}
                {submission.user.display_name ||
                  submission.user.email ||
                  "Unknown User"}
              </p>
              {submission.user.email && (
                <p className="text-gray-300">
                  <span className="text-gray-400">Email:</span>{" "}
                  {submission.user.email}
                </p>
              )}
              {submission.user.wallet_address && (
                <p className="text-gray-300">
                  <span className="text-gray-400">Wallet:</span>{" "}
                  {submission.user.wallet_address}
                </p>
              )}
            </div>
          </div>

          {/* Task Info */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="font-medium text-white mb-2">Task Details</h4>
            <div className="space-y-1 text-sm">
              <p className="text-gray-300">
                <span className="text-gray-400">Task:</span>{" "}
                {submission.task.title}
              </p>
              <p className="text-gray-300">
                <span className="text-gray-400">Type:</span>{" "}
                {submission.task.task_type}
              </p>
              <p className="text-gray-300">
                <span className="text-gray-400">Submitted:</span>{" "}
                {new Date(submission.completed_at).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Submission Data */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <h4 className="font-medium text-white mb-2">User Submission</h4>
            <div className="bg-gray-900 rounded p-3 border border-gray-700">
              {isUrl(submissionText) ? (
                <a
                  href={submissionText}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 break-all"
                >
                  {submissionText}
                </a>
              ) : (
                <p className="text-gray-300 whitespace-pre-wrap break-words">
                  {submissionText}
                </p>
              )}
            </div>
          </div>

          {/* AI Verification Context */}
          {isAIVerification && (
            <div className="bg-gray-800/50 rounded-lg p-4">
              <h4 className="font-medium text-white mb-2">AI Verification</h4>
              <div className="bg-gray-900 rounded p-3 border border-gray-700 space-y-2 text-sm">
                {aiDecision && (
                  <p className="text-gray-300">
                    <span className="text-gray-400">Decision:</span>{" "}
                    <span className="capitalize">{aiDecision}</span>
                  </p>
                )}
                {aiConfidence !== null && (
                  <p className="text-gray-300">
                    <span className="text-gray-400">Confidence:</span>{" "}
                    {aiConfidence}
                  </p>
                )}
                {aiModel && (
                  <p className="text-gray-300">
                    <span className="text-gray-400">Model:</span> {aiModel}
                  </p>
                )}
                {aiVerifiedAt && (
                  <p className="text-gray-300">
                    <span className="text-gray-400">Verified at:</span>{" "}
                    {new Date(aiVerifiedAt).toLocaleString()}
                  </p>
                )}
                {aiReason && (
                  <div className="pt-2 border-t border-gray-800">
                    <p className="text-gray-400">Reason:</p>
                    <p className="text-gray-300 whitespace-pre-wrap break-words mt-1">
                      {aiReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Current Status */}
          {submission.submission_status &&
            submission.submission_status !== "pending" && (
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="font-medium text-white mb-2">Current Status</h4>
                <p className="text-gray-300 text-sm">
                  Status:{" "}
                  <span className="capitalize">
                    {submission.submission_status}
                  </span>
                </p>
                {submission.admin_feedback && (
                  <div className="mt-2">
                    <p className="text-gray-400 text-sm">Previous feedback:</p>
                    <p className="text-gray-300 text-sm mt-1">
                      {submission.admin_feedback}
                    </p>
                  </div>
                )}
              </div>
            )}

          {/* Status Selection */}
          <div className="space-y-4">
            <h4 className="font-medium text-white">Review Decision</h4>
            <div className="space-y-3">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedStatus(option.value)}
                    className={`w-full flex items-start p-4 rounded-lg border-2 transition-all ${
                      selectedStatus === option.value
                        ? "border-flame-yellow bg-flame-yellow/10"
                        : "border-gray-700 hover:border-gray-600"
                    }`}
                    disabled={isSubmitting}
                  >
                    <Icon className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <div className="text-left">
                      <p className="font-medium text-white">{option.label}</p>
                      <p className="text-sm text-gray-400">
                        {option.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback */}
          <div className="space-y-2">
            <Label htmlFor="feedback" className="text-white">
              Feedback for User{" "}
              {selectedStatus === "completed" ? "(Optional)" : "(Required)"}
            </Label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={
                selectedStatus === "completed"
                  ? "Great work! (optional message)"
                  : selectedStatus === "failed"
                    ? "Please explain why this submission was rejected..."
                    : selectedStatus === "retry"
                      ? "Please explain what needs to be improved..."
                      : "Provide feedback for the user..."
              }
              className="bg-gray-800 border-gray-700 text-gray-100"
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Warning for non-completed status */}
          {selectedStatus && selectedStatus !== "completed" && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-yellow-300 font-medium">
                  {selectedStatus === "failed"
                    ? "This will fail the task permanently"
                    : "This will allow the user to resubmit"}
                </p>
                <p className="text-yellow-400">
                  {selectedStatus === "failed"
                    ? "User will not receive any reward for this task."
                    : "User can submit again after reviewing your feedback."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-800">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleStatusUpdate}
            disabled={
              !selectedStatus ||
              isSubmitting ||
              (selectedStatus !== "completed" && !feedback.trim())
            }
            className={
              selectedStatus
                ? statusOptions.find((o) => o.value === selectedStatus)
                    ?.color || "bg-gray-600"
                : "bg-gray-600"
            }
          >
            {isSubmitting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
                Updating...
              </>
            ) : (
              `${selectedStatus ? statusOptions.find((o) => o.value === selectedStatus)?.label : "Select Status"}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
