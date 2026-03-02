import { useCallback, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";

const log = getLogger("admin:daily-quests:list");

type DailyQuestTemplateRow = {
  id: string;
  title: string;
  description: string;
  image_url?: string | null;
  is_active: boolean;
  completion_bonus_reward_amount: number;
  lock_address?: string | null;
  lock_manager_granted: boolean;
  grant_failure_reason?: string | null;
};

export function DailyQuestList() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const { adminFetch, loading } = useAdminApi({ suppressToasts: true });
  const [rows, setRows] = useState<DailyQuestTemplateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      setError(null);
      const result = await adminFetch<{
        success: boolean;
        data: DailyQuestTemplateRow[];
      }>("/api/admin/daily-quests");
      if (result.error) throw new Error(result.error);
      const data = Array.isArray(result.data?.data) ? result.data.data : [];
      setRows(data);
    } catch (err: unknown) {
      log.error("Failed to fetch daily quests", err);
      setError(
        err instanceof Error ? err.message : "Failed to load daily quests",
      );
    }
  }, [adminFetch]);

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    fetcher: fetchRows,
  });

  const toggleStatus = async (row: DailyQuestTemplateRow) => {
    setIsToggling(row.id);
    try {
      const result = await adminFetch(`/api/admin/daily-quests/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      if (result.error) throw new Error(result.error);
      await fetchRows();
    } catch (err: unknown) {
      log.error("Failed to toggle daily quest status", err);
      const message =
        err instanceof Error
          ? err.message
          : String(err) || "Failed to update daily quest status";
      toast.error(message);
    } finally {
      setIsToggling(null);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="py-16 text-center text-gray-400">
        Loading daily quests...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Daily Quests</h2>
          <p className="text-sm text-gray-400">
            Templates publish one run per UTC day.
          </p>
        </div>
        <Link href="/admin/quests/daily/new">
          <Button>Create Daily Quest</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-200 rounded-lg p-4">
          {error}
        </div>
      )}

      <div className="border border-gray-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-4 bg-gray-900 px-4 py-3 text-sm text-gray-300">
          <div className="col-span-4">Title</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Bonus</div>
          <div className="col-span-2">Lock</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {(rows || []).map((row) => {
          const hasLock = Boolean(row.lock_address);
          const lockOk = hasLock && row.lock_manager_granted;
          return (
            <div
              key={row.id}
              className="grid grid-cols-12 gap-4 px-4 py-3 border-t border-gray-800 items-center"
            >
              <div className="col-span-4">
                <div className="text-white font-medium">{row.title}</div>
                <div className="text-xs text-gray-400 truncate">
                  {row.description}
                </div>
              </div>
              <div className="col-span-2">
                <Badge variant={row.is_active ? "secondary" : "outline"}>
                  {row.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="col-span-2 text-gray-200">
                {Number(row.completion_bonus_reward_amount || 0)} xDG
              </div>
              <div className="col-span-2 text-xs">
                {!hasLock ? (
                  <span className="text-gray-400">No lock</span>
                ) : lockOk ? (
                  <span className="text-green-300">Ready</span>
                ) : (
                  <span className="text-yellow-300">
                    Pending
                    {row.grant_failure_reason
                      ? `: ${row.grant_failure_reason}`
                      : ""}
                  </span>
                )}
              </div>
              <div className="col-span-2 flex items-center justify-end gap-2">
                <Link href={`/admin/quests/daily/${row.id}/edit`}>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleStatus(row)}
                  disabled={loading || isToggling === row.id}
                >
                  {row.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && authenticated && isAdmin && (
          <div className="px-4 py-10 text-center text-gray-400">
            No daily quests yet.
          </div>
        )}
      </div>
    </div>
  );
}
