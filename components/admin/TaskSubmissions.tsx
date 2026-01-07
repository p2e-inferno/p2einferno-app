import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ExternalLink,
  Calendar,
  User,
  MessageSquare,
  CheckCircle,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import type { MilestoneTask } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { NetworkError } from "@/components/ui/network-error";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:TaskSubmissions");

interface TaskSubmissionsProps {
  taskId: string;
  task: MilestoneTask;
}

interface SubmissionWithUser {
  id: string;
  task_id: string;
  user_id: string;
  submission_url: string;
  status: "pending" | "completed" | "failed" | "retry";
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  feedback?: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
}

export default function TaskSubmissions({
  taskId,
  task,
}: TaskSubmissionsProps) {
  const [submissions, setSubmissions] = useState<SubmissionWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [gradingStates, setGradingStates] = useState<
    Record<
      string,
      {
        status: string;
        feedback: string;
        isSubmitting: boolean;
      }
    >
  >({});
  const { user } = usePrivy();
  const { adminFetch } = useAdminApi({ suppressToasts: true });

  useEffect(() => {
    fetchSubmissions();
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: SubmissionWithUser[];
      }>(`/api/admin/task-submissions?taskId=${taskId}`);

      if (result.error) {
        throw new Error(result.error);
      }

      const data = result.data?.data || [];

      // Initialize grading states
      const initialStates: Record<string, any> = {};
      data.forEach((submission) => {
        initialStates[submission.id] = {
          status: submission.status,
          feedback: submission.feedback || "",
          isSubmitting: false,
        };
      });
      setGradingStates(initialStates);
      setSubmissions(data);
    } catch (err: any) {
      log.error("Error fetching submissions:", err);
      setError(err.message || "Failed to fetch submissions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchSubmissions();
    } finally {
      setIsRetrying(false);
    }
  };

  const updateGradingState = (
    submissionId: string,
    field: string,
    value: string,
  ) => {
    setGradingStates((prev) => ({
      ...prev,
      [submissionId]: {
        status: prev[submissionId]?.status || "pending",
        feedback: prev[submissionId]?.feedback || "",
        isSubmitting: prev[submissionId]?.isSubmitting || false,
        [field]: value,
      },
    }));
  };

  const gradeSubmission = async (submissionId: string) => {
    try {
      setGradingStates((prev) => ({
        ...prev,
        [submissionId]: {
          status: prev[submissionId]?.status || "pending",
          feedback: prev[submissionId]?.feedback || "",
          isSubmitting: true,
        },
      }));

      const gradingData = gradingStates[submissionId];

      if (!gradingData) {
        throw new Error("Grading data not found");
      }

      const result = await adminFetch<{
        success?: boolean;
        error?: string;
      }>("/api/admin/task-submissions", {
        method: "PUT",
        body: JSON.stringify({
          id: submissionId,
          status: gradingData.status,
          feedback: gradingData.feedback,
          reviewed_by: user?.id?.toString() || "",
          reviewed_at: new Date().toISOString(),
        }),
      });

      if (result.error) {
        throw new Error(result.error || "Failed to grade submission");
      }

      // Refresh submissions
      await fetchSubmissions();
    } catch (err: any) {
      log.error("Error grading submission:", err);
      setError(err.message || "Failed to grade submission");
    } finally {
      setGradingStates((prev) => ({
        ...prev,
        [submissionId]: {
          status: prev[submissionId]?.status || "pending",
          feedback: prev[submissionId]?.feedback || "",
          isSubmitting: false,
        },
      }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400" />;
      case "retry":
        return <RotateCcw className="w-4 h-4 text-yellow-400" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-900/20 text-yellow-300 border-yellow-700";
      case "completed":
        return "bg-green-900/20 text-green-300 border-green-700";
      case "failed":
        return "bg-red-900/20 text-red-300 border-red-700";
      case "retry":
        return "bg-orange-900/20 text-orange-300 border-orange-700";
      default:
        return "bg-gray-900/20 text-gray-300 border-gray-700";
    }
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="w-8 h-8 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <NetworkError
        error={error}
        onRetry={handleRetry}
        isRetrying={isRetrying}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Task Info */}
      <Card className="bg-card border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">{task.title}</CardTitle>
          {task.description && (
            <p className="text-gray-400">{task.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-flame-yellow font-semibold">
              Reward: {task.reward_amount.toLocaleString()} DG
            </span>
            <Badge variant="outline" className="text-gray-300 border-gray-600">
              {submissions.length} submission
              {submissions.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Submissions */}
      {submissions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400">No submissions yet.</p>
          <p className="text-sm text-gray-500 mt-2">
            Submissions will appear here when users complete this task.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <Card key={submission.id} className="bg-card border-gray-800">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-white font-medium">
                          User: {submission.user_id}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`${getStatusColor(submission.status)} flex items-center gap-1`}
                      >
                        {getStatusIcon(submission.status)}
                        {submission.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Submitted:{" "}
                        {new Date(submission.submitted_at).toLocaleDateString()}
                      </div>
                      {submission.reviewed_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Reviewed:{" "}
                          {new Date(
                            submission.reviewed_at,
                          ).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Submission URL */}
                <div>
                  <label className="text-sm font-medium text-gray-300 block mb-2">
                    Submission Link
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-800 border border-gray-700 rounded-md p-3">
                      <span className="text-gray-300 break-all">
                        {submission.submission_url}
                      </span>
                    </div>
                    {isValidUrl(submission.submission_url) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800"
                        onClick={() =>
                          window.open(submission.submission_url, "_blank")
                        }
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Grading Section */}
                <div className="border-t border-gray-700 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-300 block mb-2">
                        Status
                      </label>
                      <Select
                        value={
                          gradingStates[submission.id]?.status ||
                          submission.status
                        }
                        onValueChange={(value: string) =>
                          updateGradingState(submission.id, "status", value)
                        }
                      >
                        <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                          <SelectItem value="retry">Needs Retry</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-end">
                      <Button
                        onClick={() => gradeSubmission(submission.id)}
                        disabled={gradingStates[submission.id]?.isSubmitting}
                        className="bg-steel-red hover:bg-steel-red/90 text-white w-full"
                      >
                        {gradingStates[submission.id]?.isSubmitting ? (
                          <>
                            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
                            Updating...
                          </>
                        ) : (
                          "Update Grade"
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="text-sm font-medium text-gray-300 block mb-2">
                      Feedback (Optional)
                    </label>
                    <Textarea
                      value={gradingStates[submission.id]?.feedback || ""}
                      onChange={(e) =>
                        updateGradingState(
                          submission.id,
                          "feedback",
                          e.target.value,
                        )
                      }
                      placeholder="Provide feedback for the user..."
                      rows={3}
                      className="bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50"
                    />
                  </div>

                  {submission.feedback && (
                    <div className="mt-4 p-3 bg-gray-800 rounded-md border border-gray-700">
                      <p className="text-sm font-medium text-gray-300 mb-1">
                        Current Feedback:
                      </p>
                      <p className="text-gray-400 text-sm">
                        {submission.feedback}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
