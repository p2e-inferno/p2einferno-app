import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import TaskSubmissions from "@/components/admin/TaskSubmissions";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { MilestoneTask, CohortMilestone } from "@/lib/supabase/types";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";

interface TaskWithMilestone extends MilestoneTask {
  milestone: CohortMilestone & {
    cohort: {
      id: string;
      name: string;
    };
  };
}

export default function TaskSubmissionsPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
  const router = useRouter();
  const { id } = router.query;

  const [task, setTask] = useState<TaskWithMilestone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || loading) return;

    if (!authenticated || !isAdmin) {
      router.push("/");
    }
  }, [authenticated, isAdmin, loading, router, isClient]);

  useEffect(() => {
    if (!authenticated || !isAdmin || !isClient || !id) return;

    fetchTask();
  }, [authenticated, isAdmin, isClient, id]);

  const fetchTask = async () => {
    try {
      setIsLoading(true);
      
      // First get the task using API endpoint to avoid RLS issues
      const response = await fetch(`/api/admin/milestone-tasks?taskId=${id}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch task");
      }
      
      const result = await response.json();
      const taskData = result.data;

      if (!taskData || taskData.length === 0) {
        throw new Error("Task not found");
      }

      const task = taskData[0];

      // Then get the milestone
      const { data: milestoneData, error: milestoneError } = await supabase
        .from("cohort_milestones")
        .select("*")
        .eq("id", task.milestone_id);

      if (milestoneError) throw milestoneError;

      if (!milestoneData || milestoneData.length === 0) {
        throw new Error("Milestone not found");
      }

      const milestone = milestoneData[0];

      // Finally get the cohort
      const { data: cohortData, error: cohortError } = await supabase
        .from("cohorts")
        .select("id, name")
        .eq("id", milestone.cohort_id);

      if (cohortError) throw cohortError;

      if (!cohortData || cohortData.length === 0) {
        throw new Error("Cohort not found");
      }

      const cohort = cohortData[0];

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

  if (loading || !isClient) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  if (!authenticated || !isAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href={`/admin/cohorts/${task?.milestone?.cohort?.id}/milestones/${task?.milestone?.id}`}
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to milestone
          </Link>

          {isLoading ? (
            <h1 className="text-2xl font-bold text-white">
              Loading task submissions...
            </h1>
          ) : error ? (
            <h1 className="text-2xl font-bold text-white">
              Error Loading Task
            </h1>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">
                Task Submissions: {task?.title}
              </h1>
              <p className="text-gray-400 mt-1">
                {task?.milestone?.name} • {task?.milestone?.cohort?.name}
              </p>
            </>
          )}
        </div>

        {error && !isLoading && (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {!isLoading && !error && task && (
          <div className="bg-card border border-gray-800 rounded-lg p-6">
            <TaskSubmissions taskId={task.id} task={task} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}