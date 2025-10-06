import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Users, Trophy } from "lucide-react";
import Link from "next/link";
import type { MilestoneTask } from "@/lib/supabase/types";
import { NetworkError } from "@/components/ui/network-error";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:TaskList");

interface TaskWithSubmissions extends MilestoneTask {
  submission_count: number;
  pending_count: number;
  completed_count: number;
  failed_count: number;
}

interface TaskListProps {
  milestoneId: string;
  milestoneName: string;
}

export default function TaskList({
  milestoneId,
  milestoneName,
}: TaskListProps) {
  const [tasks, setTasks] = useState<TaskWithSubmissions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [milestoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiUrl = `/api/admin/tasks/by-milestone?milestone_id=${milestoneId}`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const result = await response.json();

      const tasksData = result.data || [];

      if (!tasksData || tasksData.length === 0) {
        setTasks([]);
        return;
      }

      // Fetch submission counts for each task
      const tasksWithSubmissions = await Promise.all(
        tasksData.map(async (task: any) => {
          try {
            const submissionsResponse = await fetch(
              `/api/admin/task-submissions?taskId=${task.id}`,
            );
            const submissionsResult = submissionsResponse.ok
              ? await submissionsResponse.json()
              : { data: [] };
            const submissions = submissionsResult.data || [];

            const submission_count = submissions.length;
            const pending_count = submissions.filter(
              (s: any) => s.status === "pending",
            ).length;
            const completed_count = submissions.filter(
              (s: any) => s.status === "completed",
            ).length;
            const failed_count = submissions.filter(
              (s: any) => s.status === "failed",
            ).length;

            return {
              ...task,
              submission_count,
              pending_count,
              completed_count,
              failed_count,
            };
          } catch (submissionsError) {
            log.error(
              "Error fetching submissions for task:",
              task.id,
              submissionsError,
            );
            return {
              ...task,
              submission_count: 0,
              pending_count: 0,
              completed_count: 0,
              failed_count: 0,
            };
          }
        }),
      );

      setTasks(tasksWithSubmissions);
    } catch (err: any) {
      log.error("Error fetching tasks:", err);
      setError(err.message || "Failed to fetch tasks");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchTasks();
    } finally {
      setIsRetrying(false);
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
      default:
        return "bg-gray-900/20 text-gray-300 border-gray-700";
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

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">No tasks found for this milestone.</p>
        <p className="text-sm text-gray-500 mt-2">
          Tasks will appear here once they are created.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          Tasks for {milestoneName}
        </h3>
        <Badge
          variant="outline"
          className="text-flame-yellow border-flame-yellow"
        >
          {tasks.length} Task{tasks.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid gap-4">
        {tasks.map((task, index) => (
          <Card key={task.id} className="bg-card border-gray-800">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="bg-steel-red text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </span>
                    <CardTitle className="text-white text-lg">
                      {task.title}
                    </CardTitle>
                  </div>
                  {task.description && (
                    <p className="text-gray-400 text-sm leading-relaxed">
                      {task.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-flame-yellow">
                  <Trophy className="w-4 h-4" />
                  <span className="font-semibold">
                    {task.reward_amount.toLocaleString()} DG
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">
                      {task.submission_count} submission
                      {task.submission_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {task.submission_count > 0 && (
                    <div className="flex items-center gap-2">
                      {task.pending_count > 0 && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusColor("pending")}`}
                        >
                          {task.pending_count} pending
                        </Badge>
                      )}
                      {task.completed_count > 0 && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusColor("completed")}`}
                        >
                          {task.completed_count} completed
                        </Badge>
                      )}
                      {task.failed_count > 0 && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusColor("failed")}`}
                        >
                          {task.failed_count} failed
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Link href={`/admin/cohorts/tasks/${task.id}/submissions`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 hover:bg-gray-800"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Submissions
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
