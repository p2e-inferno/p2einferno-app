import { useState, useCallback, useMemo } from "react";
import AdminListPageLayout from "@/components/admin/AdminListPageLayout";
import { Button } from "@/components/ui/button";
import { Pencil, Calendar, Trash2, Star } from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import type { Cohort, BootcampProgram } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils/dateUtils";
import { Badge } from "@/components/ui/badge";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";
import { PendingLockManagerBadge } from "@/components/admin/PendingLockManagerBadge";
import { TransferabilitySecurityBadge } from "@/components/admin/TransferabilitySecurityBadge";

const log = getLogger("admin:cohorts:index");

export default function CohortListPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const [cohorts, setCohorts] = useState<
    (Cohort & { bootcamp_program: BootcampProgram })[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch, loading } = useAdminApi(apiOptions);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cohortToDelete, setCohortToDelete] = useState<
    (Cohort & { bootcamp_program: BootcampProgram }) | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
      isLoading={isLoadingAuth || loading} // Wait for auth + data
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
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400 whitespace-nowrap">
                Bootcamp
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400 whitespace-nowrap">
                Duration
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400 whitespace-nowrap">
                Participants
              </th>
              <th className="py-3 px-4 text-left text-sm font-medium text-gray-400 whitespace-nowrap">
                Status
              </th>
              <th className="py-3 px-4 text-right text-sm font-medium text-gray-400 whitespace-nowrap">
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
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/cohorts/${cohort.id}/applications`}
                      className="hover:text-flame-yellow whitespace-nowrap"
                    >
                      {cohort.name}
                    </Link>
                    <PendingLockManagerBadge
                      lockAddress={cohort.lock_address}
                      lockManagerGranted={cohort.lock_manager_granted}
                      reason={cohort.grant_failure_reason}
                    />
                    <TransferabilitySecurityBadge
                      lockAddress={cohort.lock_address}
                      transferabilitySecured={cohort.transferability_secured}
                      reason={cohort.transferability_failure_reason}
                    />
                  </div>
                </td>
                <td className="py-4 px-4 text-sm text-white whitespace-nowrap">
                  {cohort.bootcamp_program?.name || "Unknown Bootcamp"}
                </td>
                <td className="py-4 px-4 text-sm text-white whitespace-nowrap">
                  {formatDate(cohort.start_date)} -{" "}
                  {formatDate(cohort.end_date)}
                </td>
                <td className="py-4 px-4 text-sm text-white whitespace-nowrap">
                  {cohort.current_participants} / {cohort.max_participants}
                </td>
                <td className="py-4 px-4 text-sm text-white whitespace-nowrap">
                  {getStatusBadge(cohort.status)}
                </td>
                <td className="py-4 px-4 text-right whitespace-nowrap">
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
                      onClick={() => {
                        setCohortToDelete(cohort);
                        setDeleteDialogOpen(true);
                      }}
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
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={async () => {
          if (!cohortToDelete) return;

          try {
            setIsDeleting(true);
            const result = await adminFetch<{ success: boolean }>(
              `/api/admin/cohorts?id=${cohortToDelete.id}`,
              { method: "DELETE" },
            );

            if (result.error) {
              throw new Error(result.error);
            }

            if (!result.data?.success) {
              throw new Error("Failed to delete cohort");
            }

            setCohorts((prev) =>
              prev.filter((item) => item.id !== cohortToDelete.id),
            );
            toast.success("Cohort deleted successfully");
          } catch (err: any) {
            log.error("Error deleting cohort:", err);
            toast.error(err?.message || "Failed to delete cohort");
          } finally {
            setIsDeleting(false);
            setDeleteDialogOpen(false);
            setCohortToDelete(null);
          }
        }}
        title="Delete Cohort"
        description={
          cohortToDelete
            ? `Are you sure you want to delete ${cohortToDelete.name}? This action cannot be undone.`
            : ""
        }
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
      />
    </AdminListPageLayout>
  );
}
