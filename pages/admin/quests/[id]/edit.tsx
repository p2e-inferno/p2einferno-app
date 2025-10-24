import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import QuestForm from "@/components/admin/QuestForm";
import type { Quest } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("admin:quests:[id]:edit");

export default function EditQuestPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const router = useRouter();
  const { id } = router.query;
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);

  const [quest, setQuest] = useState<Quest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null,
  );
  const [actualManagerStatus, setActualManagerStatus] = useState<
    boolean | null
  >(null);

  const { checkIsLockManager } = useIsLockManager();

  // Reusable function to fetch quest details by id
  const fetchQuestDetails = useCallback(
    async (questId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await adminFetch<{ quest: Quest }>(
          `/api/admin/quests/${questId}`,
        );

        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data?.quest) {
          throw new Error("Quest not found");
        }

        setQuest(result.data.quest);
      } catch (err: any) {
        log.error("Error fetching quest:", err);
        setError(err.message || "Failed to load quest details");
      } finally {
        setIsLoading(false);
      }
    },
    [adminFetch],
  );

  // Initial fetch on mount / id change with auth guard
  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [id as string | undefined],
    fetcher: () => {
      if (typeof id === "string") return fetchQuestDetails(id);
    },
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
    if (!quest?.lock_address || !serverWalletAddress) return;

    try {
      const isManager = await checkIsLockManager(
        serverWalletAddress as Address,
        quest.lock_address as Address,
      );
      setActualManagerStatus(isManager);
    } catch (err) {
      log.error("Failed to check lock manager status:", err);
    }
  }, [quest?.lock_address, serverWalletAddress, checkIsLockManager]);

  useEffect(() => {
    fetchServerWallet();
  }, [fetchServerWallet]);

  useEffect(() => {
    if (quest?.lock_address && serverWalletAddress) {
      checkActualManagerStatus();
    }
  }, [quest?.lock_address, serverWalletAddress, checkActualManagerStatus]);

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    if (!id || typeof id !== "string") return;
    setIsRetrying(true);
    try {
      await fetchQuestDetails(id);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <AdminEditPageLayout
      title="Edit Quest"
      backLinkHref={id ? `/admin/quests/${id}` : "/admin/quests"}
      backLinkText="Back to Quest Details"
      isLoading={isLoadingAuth || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {/* Lock Manager Status Display */}
      {quest?.lock_address && serverWalletAddress && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">
            Lock Manager Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Database Status:</span>
              <span
                className={`font-medium ${quest.lock_manager_granted ? "text-green-400" : "text-red-400"}`}
              >
                {quest.lock_manager_granted ? "✅ Granted" : "❌ Not Granted"}
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
              quest.lock_manager_granted !== actualManagerStatus && (
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

      {quest ? (
        <QuestForm quest={quest} isEditing={true} />
      ) : !isLoading && !error && !quest ? (
        <div className="bg-amber-900/20 border border-amber-700 text-amber-300 px-4 py-3 rounded">
          Quest not found. It may have been deleted or the ID is incorrect.
        </div>
      ) : null}
    </AdminEditPageLayout>
  );
}
