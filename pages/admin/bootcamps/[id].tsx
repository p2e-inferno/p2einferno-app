import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import BootcampForm from "@/components/admin/BootcampForm";
import LockManagerRetryButton from "@/components/admin/LockManagerRetryButton";
import MaxKeysSecurityButton from "@/components/admin/MaxKeysSecurityButton";
import type { BootcampProgram } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { useMaxKeysPerAddress } from "@/hooks/unlock/useMaxKeysPerAddress";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";
import type { Address } from "viem";

const log = getLogger("admin:bootcamps:[id]");

export default function EditBootcampPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const router = useRouter();
  const { id } = router.query;
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);

  const [bootcamp, setBootcamp] = useState<BootcampProgram | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null,
  );
  const [actualManagerStatus, setActualManagerStatus] = useState<
    boolean | null
  >(null);
  const [actualMaxKeysValue, setActualMaxKeysValue] = useState<bigint | null>(
    null,
  );

  const { checkIsLockManager} = useIsLockManager();
  const { checkMaxKeysPerAddress } = useMaxKeysPerAddress();

  const fetchBootcamp = useCallback(async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await adminFetch<{
        success: boolean;
        data: BootcampProgram;
        error?: string;
      }>(`/api/admin/bootcamps/${id}`);

      if (result.error) {
        throw new Error(result.error);
      }

      if (!result.data?.success || !result.data.data) {
        throw new Error(result.data?.error || "Bootcamp not found");
      }

      setBootcamp(result.data.data);
    } catch (err: any) {
      log.error("Error fetching bootcamp:", err);
      setError(err.message || "Failed to load bootcamp");
    } finally {
      setIsLoading(false);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [id as string | undefined],
    fetcher: fetchBootcamp,
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
    if (!bootcamp?.lock_address || !serverWalletAddress) return;

    try {
      const isManager = await checkIsLockManager(
        serverWalletAddress as Address,
        bootcamp.lock_address as Address,
      );
      setActualManagerStatus(isManager);
    } catch (err) {
      log.error("Failed to check lock manager status:", err);
    }
  }, [bootcamp?.lock_address, serverWalletAddress, checkIsLockManager]);

  // Check actual maxKeysPerAddress value on blockchain
  const checkActualMaxKeysValue = useCallback(async () => {
    if (!bootcamp?.lock_address) return;

    try {
      const maxKeys = await checkMaxKeysPerAddress(
        bootcamp.lock_address as Address,
      );
      setActualMaxKeysValue(maxKeys);
    } catch (err) {
      log.error("Failed to check maxKeysPerAddress:", err);
    }
  }, [bootcamp?.lock_address, checkMaxKeysPerAddress]);

  useEffect(() => {
    fetchServerWallet();
  }, [fetchServerWallet]);

  useEffect(() => {
    if (bootcamp?.lock_address && serverWalletAddress) {
      checkActualManagerStatus();
    }
  }, [bootcamp?.lock_address, serverWalletAddress, checkActualManagerStatus]);

  useEffect(() => {
    if (bootcamp?.lock_address) {
      checkActualMaxKeysValue();
    }
  }, [bootcamp?.lock_address, checkActualMaxKeysValue]);

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchBootcamp();
      // Also refresh blockchain status after retry
      if (bootcamp?.lock_address && serverWalletAddress) {
        checkActualManagerStatus();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <AdminEditPageLayout
      title="Edit Bootcamp"
      backLinkHref="/admin/bootcamps"
      backLinkText="Back to bootcamps"
      isLoading={isLoadingAuth || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {/* Lock Manager Status Display */}
      {bootcamp?.lock_address && serverWalletAddress && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Lock Manager Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Database Status:</span>
              <span
                className={`font-medium ${bootcamp.lock_manager_granted ? "text-green-400" : "text-red-400"}`}
              >
                {bootcamp.lock_manager_granted
                  ? "✅ Granted"
                  : "❌ Not Granted"}
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
              bootcamp.lock_manager_granted !== actualManagerStatus && (
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
      {bootcamp?.lock_address && actualManagerStatus === false && (
        <div className="mb-6">
          <LockManagerRetryButton
            entityType="bootcamp"
            entityId={bootcamp.id}
            lockAddress={bootcamp.lock_address}
            grantFailureReason={bootcamp.grant_failure_reason}
            onSuccess={() => {
              toast.success("Database updated successfully");
              fetchBootcamp(); // Refresh bootcamp data
              checkActualManagerStatus(); // Refresh blockchain status
            }}
            onError={(error) => {
              toast.error(`Update failed: ${error}`);
            }}
          />
        </div>
      )}

      {/* MaxKeysPerAddress Security Status Display */}
      {bootcamp?.lock_address && (
        <div className="mb-6 p-3 rounded-lg border border-slate-700 bg-slate-900">
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            MaxKeysPerAddress Security Status
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Database Status:</span>
              <span
                className={`font-medium ${bootcamp.max_keys_secured ? "text-green-400" : "text-red-400"}`}
              >
                {bootcamp.max_keys_secured ? "✅ Secured" : "❌ Not Secured"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Blockchain Value:</span>
              <span
                className={`font-medium ${
                  actualMaxKeysValue === null
                    ? "text-yellow-400"
                    : actualMaxKeysValue === 0n
                      ? "text-green-400"
                      : "text-red-400"
                }`}
              >
                {actualMaxKeysValue === null
                  ? "⏳ Checking..."
                  : actualMaxKeysValue === 0n
                    ? "✅ Secured (0)"
                    : `❌ Insecure (${actualMaxKeysValue.toString()})`}
              </span>
            </div>
            {actualMaxKeysValue !== null &&
              ((bootcamp.max_keys_secured && actualMaxKeysValue !== 0n) ||
                (!bootcamp.max_keys_secured && actualMaxKeysValue === 0n)) && (
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

      {/* MaxKeysPerAddress Security Button */}
      {bootcamp?.lock_address && actualMaxKeysValue !== 0n && (
        <div className="mb-6">
          <MaxKeysSecurityButton
            entityType="bootcamp"
            entityId={bootcamp.id}
            lockAddress={bootcamp.lock_address}
            maxKeysFailureReason={bootcamp.max_keys_failure_reason}
            onSuccess={() => {
              toast.success("Lock secured successfully");
              fetchBootcamp(); // Refresh bootcamp data
              checkActualMaxKeysValue(); // Refresh blockchain status
            }}
            onError={(error) => {
              toast.error(`Security update failed: ${error}`);
            }}
          />
        </div>
      )}

      {
        bootcamp ? (
          <BootcampForm
            bootcamp={bootcamp}
            isEditing
            onSuccess={fetchBootcamp}
          />
        ) : // This specific "Bootcamp not found" message can be shown if !isLoading && !error && !bootcamp
        // AdminEditPageLayout will show general error if `error` prop is set.
        // If no error, but no bootcamp, and not loading, it implies not found.
        !isLoading && !error && !bootcamp ? (
          <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
            Bootcamp not found. It may have been deleted or the ID is incorrect.
          </div>
        ) : null // Loading/Error is handled by AdminEditPageLayout
      }
    </AdminEditPageLayout>
  );
}
