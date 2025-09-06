import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import CohortForm from "@/components/admin/CohortForm";
import type { Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { withAdminAuth } from "@/components/admin/withAdminAuth";

function EditCohortPage() {
  const router = useRouter();
  const { cohortId } = router.query;
  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCohort = useCallback(async () => {
    if (!cohortId) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const result = await adminFetch<{success: boolean, data: Cohort}>(`/api/admin/cohorts/${cohortId}`);
      
      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.data) {
        throw new Error("Cohort not found");
      }

      setCohort(result.data.data);
    } catch (err: any) {
      console.error("Error fetching cohort:", err);
      setError(err.message || "Failed to load cohort");
    } finally {
      setIsLoading(false);
    }
  }, [cohortId]); // adminFetch is now stable due to memoized options

  useEffect(() => {
    if (cohortId) {
      fetchCohort();
    }
  }, [cohortId]);

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
      isLoading={isLoading} // This is for data loading, auth loading is handled above
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {cohort ? (
        <CohortForm cohort={cohort} isEditing />
      ) : (
        !isLoading && !error && !cohort ?
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Cohort not found. It may have been deleted or the ID is incorrect.
          </div>
        : null // Loading/Error is handled by AdminEditPageLayout based on props
      )}
    </AdminEditPageLayout>
  );
}

// Export the page wrapped in admin authentication
export default withAdminAuth(
  EditCohortPage,
  { message: "You need admin access to manage cohorts" }
);
