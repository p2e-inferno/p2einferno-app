import React, { useState } from "react";
import Image from "next/image";
import {
  X,
  Upload,
  Link as LinkIcon,
  FileText,
  Code,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { CrystalIcon } from "@/components/icons/dashboard-icons";
import { getMilestoneTimingInfo } from "@/lib/utils/milestone-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lobby:TaskSubmissionModal");

interface MilestoneTask {
  id: string;
  title: string;
  description: string;
  task_type: string;
  reward_amount: number;
  submission_requirements: any;
  validation_criteria: any;
  requires_admin_review: boolean;
  milestone?: {
    start_date?: string;
    end_date?: string;
  };
  latest_submission?: {
    id: string;
    submission_url?: string;
    submission_type?: string;
    submitted_at?: string;
    status?: string;
  } | null;
}

interface TaskSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: MilestoneTask;
  onSubmissionSuccess: () => void;
}

export default function TaskSubmissionModal({
  isOpen,
  onClose,
  task,
  onSubmissionSuccess,
}: TaskSubmissionModalProps) {
  const [_submissionType, _setSubmissionType] = useState<string>(
    task.task_type,
  );
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [submissionData, setSubmissionData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string>("");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [submissionId, setSubmissionId] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [fileType, setFileType] = useState<string>("");

  React.useEffect(() => {
    if (isOpen && task) {
      const pending =
        task.latest_submission && task.latest_submission.status === "pending"
          ? task.latest_submission
          : null;
      if (pending) {
        setSubmissionId(pending.id);
        if (pending.submission_url) {
          setSubmissionUrl(pending.submission_url);
          // If it's a file upload task and has a URL, assume it was uploaded
          if (task.task_type === "file_upload") {
            setUploadedFileUrl(pending.submission_url);
            setUploadedFileName("Previously uploaded file");
          }
        }
      } else {
        setSubmissionId("");
        setUploadedFileUrl("");
        setUploadedFileName("");
        setImagePreview("");
        setFileType("");
      }
    } else if (!isOpen) {
      // Reset all state when modal closes
      setSubmissionId("");
      setUploadedFileUrl("");
      setUploadedFileName("");
      setImagePreview("");
      setFileType("");
    }
  }, [isOpen, task]);

  if (!isOpen) return null;

  const timing = getMilestoneTimingInfo(
    task.milestone?.start_date,
    task.milestone?.end_date,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (timing.status === "not_started") {
      toast.error(
        task.milestone?.start_date
          ? `This milestone opens on ${new Date(task.milestone.start_date).toLocaleDateString()}`
          : "This milestone is not yet available",
      );
      return;
    }

    try {
      setIsSubmitting(true);

      // Validate submission based on task type
      if (task.task_type === "url_submission" && !submissionUrl.trim()) {
        toast.error("Please provide a valid URL");
        return;
      }

      if (task.task_type === "text_submission" && !submissionText.trim()) {
        toast.error("Please provide your text submission");
        return;
      }

      // Prepare submission data based on task type
      let submissionPayload: any = {
        submission_type: task.task_type,
        submission_data: {},
        submission_metadata: {},
      };

      switch (task.task_type) {
        case "url_submission":
          submissionPayload.submission_url = submissionUrl;
          submissionPayload.submission_data = { url: submissionUrl };
          break;
        case "text_submission":
          submissionPayload.submission_data = { text: submissionText };
          break;
        case "file_upload":
          if (!uploadedFileUrl && !submissionUrl) {
            toast.error("Please upload a file or provide a file URL");
            return;
          }
          submissionPayload.submission_url = uploadedFileUrl || submissionUrl;
          submissionPayload.file_urls = [submissionPayload.submission_url];
          submissionPayload.submission_data = {
            file_url: submissionPayload.submission_url,
          };
          break;
        case "contract_interaction":
          submissionPayload.submission_data = {
            ...submissionData,
            transaction_hash: submissionUrl,
            contract_address: submissionData.contract_address,
            function_called: submissionData.function_called,
          };
          break;
        case "external_verification":
          submissionPayload.submission_data = {
            verification_data: submissionText,
            external_ref: submissionUrl,
          };
          break;
      }

      const method = submissionId ? "PUT" : "POST";
      const response = await fetch(`/api/user/task/${task.id}/submit`, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          submissionId
            ? { ...submissionPayload, submission_id: submissionId }
            : submissionPayload,
        ),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to submit task");
      }

      toast.success("Task submitted successfully!");
      onSubmissionSuccess();
      onClose();

      // Reset form
      setSubmissionUrl("");
      setSubmissionText("");
      setSubmissionData({});
      setUploadedFileUrl("");
      setUploadedFileName("");
      setImagePreview("");
      setFileType("");
    } catch (error: any) {
      log.error("Submission error:", error);
      toast.error(error.message || "Failed to submit task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case "file_upload":
        return <Upload size={20} className="text-flame-yellow" />;
      case "url_submission":
        return <LinkIcon size={20} className="text-flame-yellow" />;
      case "text_submission":
        return <FileText size={20} className="text-flame-yellow" />;
      case "contract_interaction":
        return <Code size={20} className="text-flame-yellow" />;
      case "external_verification":
        return <ExternalLink size={20} className="text-flame-yellow" />;
      default:
        return <FileText size={20} className="text-flame-yellow" />;
    }
  };

  const renderSubmissionForm = () => {
    switch (task.task_type) {
      case "url_submission":
      case "file_upload":
        return (
          <div className="space-y-4">
            {task.task_type === "file_upload" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-white font-medium">Upload File</Label>
                  {uploadedFileUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedFileUrl("");
                        setUploadedFileName("");
                        setSubmissionUrl("");
                      }}
                      className="text-sm text-faded-grey hover:text-white transition-colors"
                    >
                      Remove file
                    </button>
                  )}
                </div>

                {!uploadedFileUrl ? (
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer ${
                      uploading
                        ? "border-flame-yellow/50 bg-flame-yellow/5"
                        : "border-purple-500/30 hover:border-flame-yellow/60 hover:bg-gradient-to-br hover:from-flame-yellow/5 hover:to-flame-orange/5"
                    }`}
                    onClick={() =>
                      !uploading &&
                      document.getElementById("file-input")?.click()
                    }
                  >
                    <input
                      id="file-input"
                      type="file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setUploading(true);
                          setFileType(file.type);

                          // Create image preview for image files
                          if (file.type.startsWith("image/")) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setImagePreview(event.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }

                          // Convert to base64
                          const toBase64 = (f: File) =>
                            new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const result = reader.result as string;
                                const base64 = result.split(",")[1];
                                resolve(base64 || "");
                              };
                              reader.onerror = reject;
                              reader.readAsDataURL(f);
                            });
                          const base64 = await toBase64(file);
                          const resp = await fetch(
                            `/api/user/task/${task.id}/upload`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                file: base64,
                                fileName: file.name,
                                contentType: file.type,
                              }),
                            },
                          );
                          const data = await resp.json();
                          if (!resp.ok || !data.success) {
                            throw new Error(data.error || "Upload failed");
                          }
                          setUploadedFileUrl(data.url);
                          setUploadedFileName(file.name);
                          setSubmissionUrl(data.url);
                          toast.success("File uploaded successfully!");
                        } catch (err: any) {
                          log.error("Upload failed", err);
                          toast.error(err?.message || "Failed to upload file");
                        } finally {
                          setUploading(false);
                        }
                      }}
                      disabled={uploading}
                      className="hidden"
                      accept="image/*,application/pdf,text/plain,.zip,.doc,.docx"
                    />

                    <div className="flex flex-col items-center space-y-4">
                      {uploading ? (
                        <>
                          <div className="w-12 h-12 border-4 border-flame-yellow/30 border-t-flame-yellow rounded-full animate-spin" />
                          <div className="space-y-2">
                            <h4 className="font-medium text-white">
                              Uploading file...
                            </h4>
                            <p className="text-sm text-faded-grey">
                              Please wait while we process your file
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-16 h-16 bg-gradient-to-br from-flame-yellow/20 to-flame-orange/20 rounded-xl flex items-center justify-center">
                            <Upload size={32} className="text-flame-yellow" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="font-medium text-white">
                              Drop your file here
                            </h4>
                            <p className="text-sm text-faded-grey">
                              or click to browse files (max 5MB)
                            </p>
                            <p className="text-xs text-faded-grey/70">
                              Supported: Images, PDFs, Documents, Archives
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              document.getElementById("file-input")?.click();
                            }}
                            className="inline-flex items-center space-x-2 bg-gradient-to-r from-flame-yellow to-flame-orange text-black px-6 py-2 rounded-lg font-medium hover:from-flame-yellow/90 hover:to-flame-orange/90 transition-all duration-200"
                          >
                            <Upload size={16} />
                            <span>Choose File</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Upload size={24} className="text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white">
                          {uploadedFileName}
                        </h4>
                        <p className="text-sm text-green-400">
                          File uploaded successfully
                        </p>

                        {/* Image Preview */}
                        {imagePreview && fileType.startsWith("image/") && (
                          <div className="mt-4">
                            <div className="relative max-w-md mx-auto">
                              <Image
                                src={imagePreview}
                                alt="Preview"
                                width={400}
                                height={256}
                                className="w-full h-auto max-h-64 object-contain rounded-lg border border-purple-500/20"
                                style={{ maxHeight: "16rem" }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="mt-2 group relative">
                          <p
                            className="text-xs text-faded-grey truncate cursor-pointer hover:text-purple-300 transition-colors"
                            title={uploadedFileUrl}
                          >
                            {uploadedFileUrl}
                          </p>
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                            <div className="bg-background border border-purple-500/20 rounded-lg px-3 py-2 shadow-lg max-w-sm">
                              <p className="text-xs text-white break-all">
                                {uploadedFileUrl}
                              </p>
                              <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-purple-500/20"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedFileUrl("");
                          setUploadedFileName("");
                          setSubmissionUrl("");
                          setImagePreview("");
                          setFileType("");
                        }}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <X size={16} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {(!uploadedFileUrl || task.task_type !== "file_upload") && (
              <div>
                <Label htmlFor="submission-url">
                  {task.task_type === "file_upload"
                    ? "Or provide a file URL instead"
                    : "Submission URL"}
                </Label>
                <Input
                  id="submission-url"
                  type="url"
                  value={submissionUrl}
                  onChange={(e) => setSubmissionUrl(e.target.value)}
                  placeholder={`Enter ${task.task_type === "file_upload" ? "file URL" : "URL"}`}
                  className="mt-1"
                />
                {task.task_type === "file_upload" && uploadedFileUrl && (
                  <p className="text-xs text-faded-grey mt-2">
                    Note: Providing a URL will override the uploaded file
                  </p>
                )}
              </div>
            )}
          </div>
        );

      case "text_submission":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="submission-text">Your Submission</Label>
              <Textarea
                id="submission-text"
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Enter your text submission here..."
                rows={6}
                className="mt-1"
              />
            </div>
          </div>
        );

      case "contract_interaction":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="transaction-hash">Transaction Hash</Label>
              <Input
                id="transaction-hash"
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
                placeholder="0x..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="contract-address">Contract Address</Label>
              <Input
                id="contract-address"
                value={submissionData.contract_address || ""}
                onChange={(e) =>
                  setSubmissionData({
                    ...submissionData,
                    contract_address: e.target.value,
                  })
                }
                placeholder="0x..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="function-called">Function Called</Label>
              <Input
                id="function-called"
                value={submissionData.function_called || ""}
                onChange={(e) =>
                  setSubmissionData({
                    ...submissionData,
                    function_called: e.target.value,
                  })
                }
                placeholder="Function name"
                className="mt-1"
              />
            </div>
          </div>
        );

      case "external_verification":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="external-ref">External Reference</Label>
              <Input
                id="external-ref"
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
                placeholder="External link or reference"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="verification-details">Verification Details</Label>
              <Textarea
                id="verification-details"
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Provide details for verification..."
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
        );

      default:
        return (
          <div>
            <Label>Submission not supported</Label>
            <p className="text-sm text-faded-grey">
              This task type is not yet supported.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 pb-24">
      <div className="bg-background border border-purple-500/20 rounded-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 p-6 border-b border-purple-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getTaskTypeIcon(task.task_type)}
              <h2 className="text-xl font-bold">Submit Task</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Task Info */}
          <div className="bg-purple-900/20 rounded-xl p-4 mb-6">
            <h3 className="font-bold mb-2">{task.title}</h3>
            <p className="text-sm text-faded-grey mb-3">{task.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2 py-1 bg-purple-600/20 text-purple-300 rounded">
                  {task.task_type
                    .replace("_", " ")
                    .replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
                {task.requires_admin_review && (
                  <span className="text-xs px-2 py-1 bg-orange-600/20 text-orange-300 rounded">
                    Requires Review
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <CrystalIcon size={16} className="text-cyan-400" />
                <span className="font-bold">{task.reward_amount} DGT</span>
              </div>
            </div>
          </div>

          {/* Availability / Reward Period Messaging */}
          {task.milestone && timing.status === "expired" && (
            <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle size={16} className="text-red-400" />
                <h4 className="font-medium text-red-400">Rewards Expired</h4>
              </div>
              <div className="text-sm text-faded-grey">
                The reward period for this milestone has ended. You can still
                complete the task for progress, but no DGT rewards will be
                granted.
              </div>
            </div>
          )}
          {task.milestone && timing.status === "not_started" && (
            <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <AlertTriangle size={16} className="text-blue-300" />
                <h4 className="font-medium text-blue-300">Not Available Yet</h4>
              </div>
              <div className="text-sm text-faded-grey">
                {task.milestone.start_date
                  ? `This milestone opens on ${new Date(task.milestone.start_date).toLocaleDateString()}.`
                  : "This milestone is not yet available."}
              </div>
            </div>
          )}

          {/* Submission Requirements */}
          {task.submission_requirements &&
            Object.keys(task.submission_requirements).length > 0 && (
              <div className="bg-flame-yellow/10 border border-flame-yellow/20 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-flame-yellow mb-2">
                  Submission Requirements
                </h4>
                <div className="text-sm text-faded-grey">
                  {JSON.stringify(task.submission_requirements, null, 2)}
                </div>
              </div>
            )}

          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {renderSubmissionForm()}
          </form>
        </div>

        {/* Fixed Footer with Submit Buttons */}
        <div className="border-t border-purple-500/20 p-6 bg-background">
          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || timing.status === "not_started"}
              className="flex-1 bg-flame-yellow text-black hover:bg-flame-orange transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                <>Submit Task</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
