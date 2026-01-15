import { useState, useCallback, useMemo } from "react";

import AdminListPageLayout from "@/components/admin/AdminListPageLayout";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import type { BootcampProgram } from "@/lib/supabase/types";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";

import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";
import { PendingLockManagerBadge } from "@/components/admin/PendingLockManagerBadge";
import { MaxKeysSecurityBadge } from "@/components/admin/MaxKeysSecurityBadge";
import { TransferabilitySecurityBadge } from "@/components/admin/TransferabilitySecurityBadge";

const log = getLogger("admin:bootcamps:index");

export default function BootcampsPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const [bootcamps, setBootcamps] = useState<BootcampProgram[]>([]);
  const [error, setError] = useState<string | null>(null);
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch, loading } = useAdminApi(apiOptions);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bootcampToDelete, setBootcampToDelete] =
    useState<BootcampProgram | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchBootcamps = useCallback(async () => {
    try {
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: BootcampProgram[];
      }>("/api/admin/bootcamps");

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.success) {
        throw new Error("Failed to load bootcamps");
      }

      const bootcampData = result.data.data ?? [];
      setBootcamps(Array.isArray(bootcampData) ? bootcampData : []);
    } catch (err: any) {
      log.error("Error fetching bootcamps:", err);
      setError(err.message || "Failed to load bootcamps");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    fetcher: fetchBootcamps,
  });

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchBootcamps();
    } finally {
      setIsRetrying(false);
    }
  };

  async function handleConfirmDelete() {
    if (!bootcampToDelete) return;

    try {
      setIsDeleting(true);

      // Call API to delete the bootcamp using adminFetch
      const result = await adminFetch<{ success: boolean }>(
        `/api/admin/bootcamps/${bootcampToDelete.id}`,
        {
          method: "DELETE",
        },
      );

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.success) {
        throw new Error("Failed to delete bootcamp");
      }

      // Remove from UI
      setBootcamps((prev) =>
        prev.filter((bootcamp) => bootcamp.id !== bootcampToDelete.id),
      );
    } catch (err: any) {
      log.error("Error deleting bootcamp:", err);
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setBootcampToDelete(null);
    }
  }

  return (
    <>
      <AdminListPageLayout
        title="Bootcamp Programs"
        newButtonText="New Bootcamp"
        newButtonLink="/admin/bootcamps/new"
        isLoading={isLoadingAuth || loading}
        error={error}
        onRetry={handleRetry}
        isRetrying={isRetrying}
        isEmpty={!loading && !error && bootcamps.length === 0}
        emptyStateTitle="No bootcamps found"
        emptyStateMessage="Create your first bootcamp to get started"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Name
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Duration
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Max Reward
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Price
                </th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                  Registration
                </th>
                <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {bootcamps.map((bootcamp) => (
                <tr
                  key={bootcamp.id}
                  className="border-b border-gray-800 hover:bg-gray-900"
                >
                  <td className="py-4 px-4 text-sm text-white">
                    <div className="flex items-center gap-2">
                      {bootcamp.name}
                      <PendingLockManagerBadge
                        lockAddress={bootcamp.lock_address}
                        lockManagerGranted={bootcamp.lock_manager_granted}
                        reason={bootcamp.grant_failure_reason}
                      />
                      <MaxKeysSecurityBadge
                        lockAddress={bootcamp.lock_address}
                        maxKeysSecured={bootcamp.max_keys_secured}
                        reason={bootcamp.max_keys_failure_reason}
                      />
                      <TransferabilitySecurityBadge
                        lockAddress={bootcamp.lock_address}
                        transferabilitySecured={
                          bootcamp.transferability_secured
                        }
                        reason={bootcamp.transferability_failure_reason}
                      />
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    {bootcamp.duration_weeks} weeks
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    {bootcamp.max_reward_dgt?.toLocaleString() || 0} DG
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    Contact for pricing
                  </td>
                  <td className="py-4 px-4 text-sm text-white">
                    Open Registration
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <Link href={`/admin/bootcamps/${bootcamp.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gray-700 hover:border-flame-yellow"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 hover:border-red-500 hover:text-red-500"
                        onClick={() => {
                          setBootcampToDelete(bootcamp);
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
      </AdminListPageLayout>

      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Bootcamp"
        description={`Are you sure you want to delete ${bootcampToDelete?.name}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
      />
    </>
  );
}
