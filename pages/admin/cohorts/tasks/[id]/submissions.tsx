import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import TaskSubmissions from "@/components/admin/TaskSubmissions";
import type { MilestoneTask, CohortMilestone } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { withAdminAuth } from "@/components/admin/withAdminAuth";

interface TaskWithMilestone extends MilestoneTask {
  milestone: CohortMilestone & {
    cohort: {
      id: string;
      name: string;
    };
  };
}

function TaskSubmissionsPage() {
  const router = useRouter();
  const { id } = router.query;
  const { adminFetch } = useAdminApi({ suppressToasts: true });

  const [task, setTask] = useState<TaskWithMilestone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchTask = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get the task using API endpoint
      const taskUrl = `/api/admin/milestone-tasks?task_id=${id}`;
      console.log('DEBUG: Fetching task with URL:', taskUrl);
      console.log('DEBUG: Task ID value:', id);
      
      const taskResult = await adminFetch<{success: boolean, data: MilestoneTask[]}>(taskUrl);
      
      if (taskResult.error) {
        throw new Error(taskResult.error);
      }
      
      const taskData = taskResult.data?.data;
      if (!taskData || taskData.length === 0) {
        throw new Error("Task not found");
      }

      const task = taskData[0];
      if (!task || !task.id) {
        throw new Error("Invalid task data");
      }

      // Get the milestone (use milestones endpoint, not milestone-tasks)
      const milestoneResult = await adminFetch<{success: boolean, data: CohortMilestone}>(`/api/admin/milestones?milestone_id=${task?.milestone_id}`);
      
      if (milestoneResult.error) {
        throw new Error(milestoneResult.error);
      }
      
      const milestone = milestoneResult.data?.data;
      if (!milestone) {
        throw new Error("Milestone not found");
      }

      // Get the cohort
      const cohortResult = await adminFetch<{success: boolean, data: {id: string, name: string}}>(`/api/admin/cohorts/${milestone.cohort_id}`);
      
      if (cohortResult.error) {
        throw new Error(cohortResult.error);
      }
      
      const cohort = cohortResult.data?.data;
      if (!cohort) {
        throw new Error("Cohort not found");
      }

      // Combine the data
      const combinedTask: TaskWithMilestone = {
        ...task,
        milestone: {
          ...milestone,
          cohort: cohort
        }
      };

      setTask(combinedTask);
    } catch (err: any) {
      console.error("Error fetching task:", err);
      setError(err.message || "Failed to load task");
    } finally {
      setIsLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    fetchTask();
  }, [id, fetchTask]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchTask();
    } finally {
      setIsRetrying(false);
    }
  };

  // Safety net: ensure retry button is shown even if layout props are not picked up
  if (!isLoading && error) {
    return (
      <AdminEditPageLayout
        title={"Task Submissions"}
        backLinkHref={"/admin/cohorts"}
        backLinkText="Back to milestone"
        isLoading={false}
        error={error}
        onRetry={handleRetry}
        isRetrying={isRetrying}
      >
        {/* no children when in error */}
      </AdminEditPageLayout>
    );
  }

  return (
    <AdminEditPageLayout
      title={task ? `Task Submissions: ${task.title}` : "Task Submissions"}
      backLinkHref={task ? `/admin/cohorts/${task.milestone?.cohort?.id}/milestones/${task.milestone?.id}` : "/admin/cohorts"}
      backLinkText="Back to milestone"
      isLoading={isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {task && (
        <>
          <div className="mb-6">
            <p className="text-gray-400">
              {task.milestone?.name} • {task.milestone?.cohort?.name}
            </p>
          </div>
          <div className="bg-card border border-gray-800 rounded-lg p-6">
            <TaskSubmissions taskId={task.id} task={task} />
          </div>
        </>
      )}
    </AdminEditPageLayout>
  );
}

export default withAdminAuth(
  TaskSubmissionsPage,
  { message: "You need admin access to view task submissions" }
);
