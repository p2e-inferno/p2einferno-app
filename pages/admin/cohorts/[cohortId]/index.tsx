import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import CohortForm from "@/components/admin/CohortForm";
import LockManagerRetryButton from "@/components/admin/LockManagerRetryButton";
import type { Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";
import type { Address } from "viem";

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
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null,
  );
  const [actualManagerStatus, setActualManagerStatus] = useState<
    boolean | null
  >(null);

  const { checkIsLockManager } = useIsLockManager();

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

  // Fetch server wallet address
  const fetchServerWallet = useCallback(async () => {
    try {
      const result = await adminFetch<{ serverWalletAddress: string }>(
        "/api/admin/server-wallet",
      );
      if (result.data?.serverWalletAddress) {
        setServerWalletAddress(result.data.serverWalletAddress);
      }
    } catch (err) {
      log.error("Failed to fetch server wallet address:", err);
    }
  }, [adminFetch]);

  // Check actual lock manager status on blockchain
  const checkActualManagerStatus = useCallback(async () => {
    if (!cohort?.lock_address || !serverWalletAddress) return;

    try {
      const isManager = await checkIsLockManager(
        serverWalletAddress as Address,
        cohort.lock_address as Address,
      );
      setActualManagerStatus(isManager);
    } catch (err) {
      log.error("Failed to check lock manager status:", err);
    }
  }, [cohort?.lock_address, serverWalletAddress, checkIsLockManager]);

  useEffect(() => {
    fetchServerWallet();
  }, [fetchServerWallet]);

  useEffect(() => {
    if (cohort?.lock_address && serverWalletAddress) {
      checkActualManagerStatus();
    }
  }, [cohort?.lock_address, serverWalletAddress, checkActualManagerStatus]);

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
      {/* Lock Manager Status Display */}
      {cohort?.lock_address && serverWalletAddress && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Lock Manager Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Database Status:</span>
              <span
                className={`font-medium ${cohort.lock_manager_granted ? "text-green-400" : "text-red-400"}`}
              >
                {cohort.lock_manager_granted ? "✅ Granted" : "❌ Not Granted"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Blockchain Status:</span>
              <span
                className={`font-medium ${
                  actualManagerStatus === null
                    ? "text-yellow-400"
                    : actualManagerStatus
                      ? "text-green-400"
                      : "text-red-400"
                }`}
              >
                {actualManagerStatus === null
                  ? "⏳ Checking..."
                  : actualManagerStatus
                    ? "✅ Is Manager"
                    : "❌ Not Manager"}
              </span>
            </div>
            {actualManagerStatus !== null &&
              cohort.lock_manager_granted !== actualManagerStatus && (
                <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700 rounded">
                  <p className="text-amber-300 text-xs font-medium">
                    ⚠️ Status Mismatch: Database and blockchain states
                    don&apos;t match!
                  </p>
                </div>
              )}
          </div>
        </div>
      )}

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
              checkActualManagerStatus(); // Refresh blockchain status
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
