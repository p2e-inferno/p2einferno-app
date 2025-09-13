import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import CohortForm from "@/components/admin/CohortForm";
import type { Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:cohorts:edit-[cohortId]");

export default function EditCohortPage() {
  const {
    authenticated,
    isAdmin,
    loading: authLoading,
    user,
  } = useLockManagerAdminAuth();
  const router = useRouter();
  const { cohortId } = router.query;
  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract actual cohort ID from the route parameter
  const actualCohortId =
    typeof cohortId === "string" && cohortId.startsWith("edit-")
      ? cohortId.replace("edit-", "")
      : cohortId;

  const fetchCohort = useCallback(async () => {
    if (!actualCohortId || typeof actualCohortId !== "string") return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{ success: boolean; data: Cohort }>(
        `/api/admin/cohorts/${actualCohortId}`,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.data) {
        throw new Error("Cohort not found");
      }

      setCohort(result.data.data);
    } catch (err: any) {
      log.error("Error fetching cohort:", err);
      setError(err.message || "Failed to load cohort");
    } finally {
      setIsLoading(false);
    }
  }, [actualCohortId, adminFetch]); // Remove adminFetch from dependencies to prevent infinite loop

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [actualCohortId as string | undefined],
    fetcher: fetchCohort,
  });

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchCohort();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <AdminEditPageLayout
      title="Edit Cohort"
      backLinkHref="/admin/cohorts"
      backLinkText="Back to cohorts"
      isLoading={authLoading || isLoading} // This is for data loading, auth loading is handled above
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {
        cohort ? (
          <CohortForm cohort={cohort} isEditing />
        ) : !isLoading && !error && !cohort ? (
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Cohort not found. It may have been deleted or the ID is incorrect.
          </div>
        ) : null // Loading/Error is handled by AdminEditPageLayout based on props
      }
    </AdminEditPageLayout>
  );
}
