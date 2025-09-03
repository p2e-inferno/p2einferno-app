import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePrivy } from "@privy-io/react-auth";
import { Eye, Filter } from "lucide-react";
import SubmissionReviewModal from "./SubmissionReviewModal";
import type {
  UserTaskCompletion,
  SubmissionStatus,
} from "@/lib/supabase/types";
import { NetworkError } from "@/components/ui/network-error";

interface QuestSubmissionsTableProps {
  questId: string;
  onStatusUpdate?: () => void;
}

interface SubmissionWithDetails extends UserTaskCompletion {
  submission_data: any; // Make required to match modal interface
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
}

const statusOptions: {
  value: SubmissionStatus | "all";
  label: string;
  color: string;
}[] = [
  { value: "all", label: "All", color: "gray" },
  { value: "pending", label: "Pending", color: "orange" },
  { value: "completed", label: "Completed", color: "green" },
  { value: "failed", label: "Failed", color: "red" },
  { value: "retry", label: "Retry", color: "yellow" },
];

export default function QuestSubmissionsTable({
  questId,
  onStatusUpdate,
}: QuestSubmissionsTableProps) {
  const { getAccessToken } = usePrivy();
  const [submissions, setSubmissions] = useState<SubmissionWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "all">(
    "all"
  );
  const [selectedSubmission, setSelectedSubmission] =
    useState<SubmissionWithDetails | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, [questId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSubmissions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const params = new URLSearchParams();
      params.append("questId", questId);
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const response = await fetch(
        `/api/admin/quests/submissions?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }

      const json = (await response.json()) as {
        submissions: SubmissionWithDetails[];
      };
      setSubmissions(json.submissions || []);
    } catch (err: any) {
      console.error("Error fetching submissions:", err);
      setError(err.message || "Failed to load submissions");
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

  const handleReview = (submission: SubmissionWithDetails) => {
    setSelectedSubmission(submission);
    setIsReviewModalOpen(true);
  };

  const handleStatusUpdate = async (
    submissionId: string,
    newStatus: SubmissionStatus,
    feedback?: string
  ) => {
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch("/api/admin/quests/submissions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          submissionId,
          status: newStatus,
          feedback,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update submission status");
      }

      // Refresh submissions
      await fetchSubmissions();

      // Notify parent to refresh stats
      if (onStatusUpdate) {
        onStatusUpdate();
      }

      setIsReviewModalOpen(false);
    } catch (err: any) {
      console.error("Error updating submission:", err);
      setError(err.message || "Failed to update submission");
    }
  };

  const getStatusBadge = (status: SubmissionStatus) => {
    const config = statusOptions.find((s) => s.value === status);
    if (!config) return null;

    const colorClasses = {
      orange: "bg-orange-600",
      green: "bg-green-600",
      red: "bg-red-600",
      yellow: "bg-yellow-600",
      gray: "bg-gray-600",
    };

    return (
      <Badge
        className={colorClasses[config.color as keyof typeof colorClasses]}
      >
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
      </div>
    );
  }

  if (error) {
    return <NetworkError error={error} onRetry={handleRetry} isRetrying={isRetrying} />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">Filter by status:</span>
          <div className="flex gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() =>
                  setStatusFilter(option.value as SubmissionStatus | "all")
                }
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === option.value
                    ? "bg-flame-yellow text-black"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-sm text-gray-400">
          {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      {submissions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  User
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Task
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Submission
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Date
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Status
                </th>
                <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr
                  key={submission.id}
                  className="border-b border-gray-800 hover:bg-gray-900"
                >
                  <td className="py-4 px-4 text-sm">
                    <div>
                      <p className="text-white font-medium">
                        {submission.user?.display_name ||
                          submission.user?.email ||
                          "Unknown User"}
                      </p>
                      {submission.user?.wallet_address && (
                        <p className="text-gray-400 text-xs">
                          {submission.user.wallet_address.slice(0, 6)}...
                          {submission.user.wallet_address.slice(-4)}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    {submission.task?.title || "Unknown Task"}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {submission.submission_data ? (
                      <div className="max-w-xs truncate text-gray-300">
                        {typeof submission.submission_data === "string"
                          ? submission.submission_data
                          : JSON.stringify(submission.submission_data)}
                      </div>
                    ) : (
                      <span className="text-gray-500">No data</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-400">
                    {formatDate(submission.completed_at)}
                  </td>
                  <td className="py-4 px-4 text-sm">
                    {getStatusBadge(submission.submission_status || "pending")}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-700 hover:border-blue-500"
                      onClick={() => handleReview(submission)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">
            {statusFilter === "all"
              ? "No submissions found for this quest"
              : `No ${statusFilter} submissions found`}
          </p>
        </div>
      )}

      {/* Review Modal */}
      {selectedSubmission && (
        <SubmissionReviewModal
          submission={selectedSubmission}
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  );
}
