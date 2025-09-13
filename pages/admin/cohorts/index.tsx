import { useState, useCallback, useMemo } from "react";
import AdminListPageLayout from "@/components/admin/AdminListPageLayout";
import { Button } from "@/components/ui/button";
import { Pencil, Calendar, Trash2, Star } from "lucide-react";
import Link from "next/link";
import type { Cohort, BootcampProgram } from "@/lib/supabase/types";
import { formatDate } from "@/lib/dateUtils";
import { Badge } from "@/components/ui/badge";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:cohorts:index");

export default function CohortListPage() {
  const {
    authenticated,
    isAdmin,
    loading: authLoading,
    user,
  } = useLockManagerAdminAuth();
  const [cohorts, setCohorts] = useState<
    (Cohort & { bootcamp_program: BootcampProgram })[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch, loading } = useAdminApi(apiOptions);
  const fetchCohorts = useCallback(async () => {
    try {
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: (Cohort & { bootcamp_program: BootcampProgram })[];
      }>("/api/admin/cohorts");

      if (result.error) {
        throw new Error(result.error);
      }

      // Extract the data from the nested response structure
      const cohortData = result.data?.data || [];
      setCohorts(Array.isArray(cohortData) ? cohortData : []);
    } catch (err: any) {
      log.error("Error fetching cohorts:", err);
      setError(err.message || "Failed to load cohorts");
    }
  }, [adminFetch]);

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    fetcher: fetchCohorts,
  });

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchCohorts();
    } finally {
      setIsRetrying(false);
    }
  };

  // Function to get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge className="bg-green-600">Open</Badge>;
      case "closed":
        return <Badge className="bg-red-600">Closed</Badge>;
      case "upcoming":
        return <Badge className="bg-flame-yellow text-black">Upcoming</Badge>;
      default:
        return <Badge className="bg-gray-600">{status}</Badge>;
    }
  };

  return (
    <AdminListPageLayout
      title="Cohorts"
      newButtonText="New Cohort"
      newButtonLink="/admin/cohorts/new"
      isLoading={authLoading || loading} // Wait for auth + data
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
      isEmpty={!loading && !error && cohorts.length === 0}
      emptyStateTitle="No cohorts found"
      emptyStateMessage="Create your first cohort to get started"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                Name
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                Bootcamp
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                Duration
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                Participants
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                Status
              </th>
              <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr
                key={cohort.id}
                className="border-b border-gray-800 hover:bg-gray-900"
              >
                <td className="py-4 px-4 text-sm text-white">
                  <Link
                    href={`/admin/cohorts/${cohort.id}/applications`}
                    className="hover:text-flame-yellow"
                  >
                    {cohort.name}
                  </Link>
                </td>
                <td className="py-4 px-4 text-sm text-white">
                  {cohort.bootcamp_program?.name || "Unknown Bootcamp"}
                </td>
                <td className="py-4 px-4 text-sm text-white">
                  {formatDate(cohort.start_date)} -{" "}
                  {formatDate(cohort.end_date)}
                </td>
                <td className="py-4 px-4 text-sm text-white">
                  {cohort.current_participants} / {cohort.max_participants}
                </td>
                <td className="py-4 px-4 text-sm text-white">
                  {getStatusBadge(cohort.status)}
                </td>
                <td className="py-4 px-4 text-right">
                  <div className="flex justify-end space-x-2">
                    <Link href={`/admin/cohorts/${cohort.id}`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 hover:border-flame-yellow"
                        title="Edit cohort"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href={`/admin/cohorts/${cohort.id}/milestones`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 hover:border-cyan-500"
                        title="Manage milestones"
                      >
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href={`/admin/cohorts/${cohort.id}/program-details`}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 hover:border-flame-yellow"
                        title="Program details"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-700 hover:border-red-500 hover:text-red-500"
                      title="Delete cohort"
                      // TODO: Implement delete functionality
                      onClick={() =>
                        alert("Delete functionality not yet implemented.")
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminListPageLayout>
  );
}
