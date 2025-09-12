import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminLayout from "@/components/layouts/AdminLayout";
import MilestoneList from "@/components/admin/MilestoneList";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { withAdminAuth } from "@/components/admin/withAdminAuth";
import { NetworkError } from "@/components/ui/network-error";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:cohorts:[cohortId]:milestones");

interface CohortWithProgram extends Cohort {
  bootcamp_program?: {
    id: string;
    name: string;
  };
}

function CohortMilestonesPage() {
  const router = useRouter();
  const { cohortId } = router.query;

  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [cohort, setCohort] = useState<CohortWithProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCohort = useCallback(async () => {
    if (!cohortId) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: CohortWithProgram;
      }>(`/api/admin/cohorts/${cohortId}`);

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
  }, [cohortId]); // Remove adminFetch from dependencies to prevent infinite loop

  useEffect(() => {
    if (cohortId) {
      fetchCohort();
    }
  }, [cohortId, fetchCohort]);

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
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/cohorts"
            className="text-gray-400 hover:text-white flex items-center mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to cohorts
          </Link>

          <h1 className="text-2xl font-bold text-white">
            {cohort?.name ? `Milestones: ${cohort.name}` : "Cohort Milestones"}
          </h1>
          {!error && cohort && (
            <p className="text-gray-400 mt-1">
              Manage cohort milestones for{" "}
              {cohort.bootcamp_program?.name || "Unknown Bootcamp"}
            </p>
          )}
        </div>

        {error && !isLoading && (
          <NetworkError
            error={error}
            onRetry={handleRetry}
            isRetrying={isRetrying}
          />
        )}

        {!isLoading && !error && cohort && (
          <div className="bg-card border border-gray-800 rounded-lg p-6">
            <MilestoneList cohortId={cohort.id} />
          </div>
        )}

        {isLoading && (
          <div className="w-full flex justify-center items-center min-h-[400px]">
            <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

// Export the page wrapped in admin authentication
export default withAdminAuth(CohortMilestonesPage, {
  message: "You need admin access to manage cohorts",
});
