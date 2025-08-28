import React, { useState } from "react";
import { X, Upload, Link as LinkIcon, FileText, Code, ExternalLink } from "lucide-react";
import { CrystalIcon } from "@/components/icons/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "react-hot-toast";

interface MilestoneTask {
  id: string;
  title: string;
  description: string;
  task_type: string;
  reward_amount: number;
  submission_requirements: any;
  validation_criteria: any;
  requires_admin_review: boolean;
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
  const [submissionType, setSubmissionType] = useState<string>(task.task_type);
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [submissionData, setSubmissionData] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);

      // Validate submission based on task type
      if (task.task_type === 'url_submission' && !submissionUrl.trim()) {
        toast.error("Please provide a valid URL");
        return;
      }
      
      if (task.task_type === 'text_submission' && !submissionText.trim()) {
        toast.error("Please provide your text submission");
        return;
      }

      // Prepare submission data based on task type
      let submissionPayload: any = {
        submission_type: task.task_type,
        submission_data: {},
        submission_metadata: {}
      };

      switch (task.task_type) {
        case 'url_submission':
          submissionPayload.submission_url = submissionUrl;
          submissionPayload.submission_data = { url: submissionUrl };
          break;
        case 'text_submission':
          submissionPayload.submission_data = { text: submissionText };
          break;
        case 'file_upload':
          // For now, treat as URL (can be enhanced later for actual file upload)
          submissionPayload.submission_url = submissionUrl;
          submissionPayload.submission_data = { file_url: submissionUrl };
          break;
        case 'contract_interaction':
          submissionPayload.submission_data = {
            ...submissionData,
            transaction_hash: submissionUrl,
            contract_address: submissionData.contract_address,
            function_called: submissionData.function_called
          };
          break;
        case 'external_verification':
          submissionPayload.submission_data = {
            verification_data: submissionText,
            external_ref: submissionUrl
          };
          break;
      }

      const response = await fetch(`/api/user/task/${task.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionPayload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit task');
      }

      toast.success("Task submitted successfully!");
      onSubmissionSuccess();
      onClose();
      
      // Reset form
      setSubmissionUrl("");
      setSubmissionText("");
      setSubmissionData({});

    } catch (error: any) {
      console.error("Submission error:", error);
      toast.error(error.message || "Failed to submit task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case 'file_upload':
        return <Upload size={20} className="text-flame-yellow" />;
      case 'url_submission':
        return <LinkIcon size={20} className="text-flame-yellow" />;
      case 'text_submission':
        return <FileText size={20} className="text-flame-yellow" />;
      case 'contract_interaction':
        return <Code size={20} className="text-flame-yellow" />;
      case 'external_verification':
        return <ExternalLink size={20} className="text-flame-yellow" />;
      default:
        return <FileText size={20} className="text-flame-yellow" />;
    }
  };

  const renderSubmissionForm = () => {
    switch (task.task_type) {
      case 'url_submission':
      case 'file_upload':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="submission-url">
                {task.task_type === 'file_upload' ? 'File URL' : 'Submission URL'}
              </Label>
              <Input
                id="submission-url"
                type="url"
                value={submissionUrl}
                onChange={(e) => setSubmissionUrl(e.target.value)}
                placeholder={`Enter ${task.task_type === 'file_upload' ? 'file URL' : 'URL'}`}
                className="mt-1"
              />
            </div>
          </div>
        );
      
      case 'text_submission':
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
      
      case 'contract_interaction':
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
                onChange={(e) => setSubmissionData({...submissionData, contract_address: e.target.value})}
                placeholder="0x..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="function-called">Function Called</Label>
              <Input
                id="function-called"
                value={submissionData.function_called || ""}
                onChange={(e) => setSubmissionData({...submissionData, function_called: e.target.value})}
                placeholder="Function name"
                className="mt-1"
              />
            </div>
          </div>
        );
      
      case 'external_verification':
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
            <p className="text-sm text-faded-grey">This task type is not yet supported.</p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-purple-500/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
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
        <div className="p-6">
          {/* Task Info */}
          <div className="bg-purple-900/20 rounded-xl p-4 mb-6">
            <h3 className="font-bold mb-2">{task.title}</h3>
            <p className="text-sm text-faded-grey mb-3">{task.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2 py-1 bg-purple-600/20 text-purple-300 rounded">
                  {task.task_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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

          {/* Submission Requirements */}
          {task.submission_requirements && Object.keys(task.submission_requirements).length > 0 && (
            <div className="bg-flame-yellow/10 border border-flame-yellow/20 rounded-lg p-4 mb-6">
              <h4 className="font-medium text-flame-yellow mb-2">Submission Requirements</h4>
              <div className="text-sm text-faded-grey">
                {JSON.stringify(task.submission_requirements, null, 2)}
              </div>
            </div>
          )}

          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {renderSubmissionForm()}

            {/* Submit Button */}
            <div className="flex space-x-3 pt-4">
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
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-flame-yellow text-black hover:bg-flame-orange transition-all"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit Task
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}