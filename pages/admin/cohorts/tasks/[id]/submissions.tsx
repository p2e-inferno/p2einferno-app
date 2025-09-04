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
      
      // Use consolidated bundle endpoint for task + milestone + cohort
      const detailsUrl = `/api/v2/admin/tasks/details?task_id=${id}&include=milestone,cohort`;
      const result = await adminFetch<{ success: boolean; data: { task: MilestoneTask; milestone: CohortMilestone; cohort: { id: string; name: string } } }>(detailsUrl);
      if (result.error) throw new Error(result.error);
      const data = result.data?.data as any;
      if (!data?.task || !data?.milestone || !data?.cohort) throw new Error('Failed to load task details');
      const combinedTask: TaskWithMilestone = {
        ...data.task,
        milestone: {
          ...data.milestone,
          cohort: data.cohort,
        },
      } as any;
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
