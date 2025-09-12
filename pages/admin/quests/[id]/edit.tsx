import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import QuestForm from "@/components/admin/QuestForm";
import type { Quest } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { withAdminAuth } from "@/components/admin/withAdminAuth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:quests:[id]:edit");

function EditQuestPage() {
  const router = useRouter();
  const { id } = router.query;
  const { adminFetch } = useAdminApi({ suppressToasts: true });

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

  // Initial fetch on mount / id change
  useEffect(() => {
    if (id && typeof id === "string") {
      fetchQuestDetails(id);
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      backLinkHref={`/admin/quests/${id}`}
      backLinkText="Back to Quest Details"
      isLoading={isLoading}
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

// Export the page wrapped in admin authentication
export default withAdminAuth(EditQuestPage, {
  message: "You need admin access to manage quests",
});
