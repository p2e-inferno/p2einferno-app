import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import QuestForm from "@/components/admin/QuestForm";
import type { Quest } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:quests:[id]:edit");

export default function EditQuestPage() {
  const {
    authenticated,
    isAdmin,
    loading: authLoading,
    user,
  } = useLockManagerAdminAuth();
  const router = useRouter();
  const { id } = router.query;
  const apiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(apiOptions);

  const [quest, setQuest] = useState<Quest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      isLoading={authLoading || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
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
