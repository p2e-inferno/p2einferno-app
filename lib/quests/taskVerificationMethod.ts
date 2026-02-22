import type { TaskType } from "@/lib/supabase/types";

type TaskVerificationInput = {
  task_type?: TaskType;
  verification_method?: string | null;
};

export function resolveTaskVerificationMethod(
  task: TaskVerificationInput,
): string | undefined {
  if (task.task_type === "deploy_lock") {
    return "blockchain";
  }
  return task.verification_method ?? undefined;
}
