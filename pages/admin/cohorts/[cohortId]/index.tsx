import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import CohortForm from "@/components/admin/CohortForm";
import LockManagerRetryButton from "@/components/admin/LockManagerRetryButton";
import type { Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";

const log = getLogger("admin:cohorts:[cohortId]:index");

export default function EditCohortPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
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

      const result = await adminFetch<{ success: boolean; data: Cohort }>(
        `/api/admin/cohorts/${cohortId}`,
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.data) {
        throw new Error("Cohort not found");
      }

      log.info("Cohort data fetched from API", {
        cohortId: result.data.data.id,
        lockAddress: result.data.data.lock_address,
        lockManagerGranted: result.data.data.lock_manager_granted,
        grantFailureReason: result.data.data.grant_failure_reason,
        lockManagerGrantedType: typeof result.data.data.lock_manager_granted,
      });
      setCohort(result.data.data);
    } catch (err: any) {
      log.error("Error fetching cohort:", err);
      setError(err.message || "Failed to load cohort");
    } finally {
      setIsLoading(false);
    }
  }, [cohortId, adminFetch]); // adminFetch is now stable due to memoized options

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [cohortId as string | undefined],
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
      isLoading={isLoadingAuth || isLoading} // This is for data loading, auth loading is handled above
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {/* Lock Manager Grant Retry Button */}
      {cohort?.lock_address && cohort?.lock_manager_granted === false && (
        <div className="mb-6">
          <LockManagerRetryButton
            entityType="cohort"
            entityId={cohort.id}
            lockAddress={cohort.lock_address}
            grantFailureReason={cohort.grant_failure_reason}
            onSuccess={() => {
              toast.success("Database updated successfully");
              fetchCohort(); // Refresh cohort data
            }}
            onError={(error) => {
              toast.error(`Update failed: ${error}`);
            }}
          />
        </div>
      )}

      {
        cohort ? (
          <CohortForm cohort={cohort} isEditing onSuccess={fetchCohort} />
        ) : !isLoading && !error && !cohort ? (
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Cohort not found. It may have been deleted or the ID is incorrect.
          </div>
        ) : null // Loading/Error is handled by AdminEditPageLayout based on props
      }
    </AdminEditPageLayout>
  );
}
