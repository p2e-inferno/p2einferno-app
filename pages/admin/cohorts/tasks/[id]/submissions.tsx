import { useState, useEffect } from "react";
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
  const { adminFetch } = useAdminApi();

  const [task, setTask] = useState<TaskWithMilestone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchTask();
  }, [id]);

  const fetchTask = async () => {
    try {
      setIsLoading(true);
      
      // Get the task using API endpoint
      const taskResult = await adminFetch<{success: boolean, data: MilestoneTask[]}>(`/api/admin/milestone-tasks?taskId=${id}`);
      
      if (taskResult.error) {
        throw new Error(taskResult.error);
      }
      
      const taskData = taskResult.data?.data;
      if (!taskData || taskData.length === 0) {
        throw new Error("Task not found");
      }

      const task = taskData[0];

      // Get the milestone
      const milestoneResult = await adminFetch<{success: boolean, data: CohortMilestone}>(`/api/admin/milestones?milestone_id=${task.milestone_id}`);
      
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
  };

  return (
    <AdminEditPageLayout
      title={task ? `Task Submissions: ${task.title}` : "Task Submissions"}
      backLinkHref={task ? `/admin/cohorts/${task.milestone?.cohort?.id}/milestones/${task.milestone?.id}` : "/admin/cohorts"}
      backLinkText="Back to milestone"
      isLoading={isLoading}
      error={error}
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