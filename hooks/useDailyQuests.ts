import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useDailyQuests");

export type DailyQuestEligibility = {
  eligible: boolean;
  failures: Array<{ type: string; message: string }>;
  vendor_stage_current?: number;
  vendor_stage_required?: number;
};

export type DailyQuestRunListItem = {
  id: string;
  run_date: string;
  starts_at: string;
  ends_at: string;
  status: "active" | "closed";
  completion_bonus_reward_amount: number;
  template: {
    id: string;
    title: string;
    description: string;
    image_url?: string | null;
    lock_address?: string | null;
    eligibility_config?: Record<string, unknown>;
  } | null;
  daily_quest_run_tasks: any[];
  eligibility?: DailyQuestEligibility;
  eligibility_evaluated_wallet?: string | null;
};

export function useDailyQuests() {
  const { ready, authenticated } = usePrivy();
  const selectedWallet = useSmartWalletSelection();
  const [runs, setRuns] = useState<DailyQuestRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDailyQuests = useCallback(async () => {
    try {
      setError(null);
      const headers: Record<string, string> = {};
      if (authenticated && selectedWallet?.address) {
        headers["X-Active-Wallet"] = selectedWallet.address;
      }

      const resp = await fetch("/api/daily-quests", { headers });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to fetch daily quests");
      }
      setRuns(Array.isArray(json?.runs) ? json.runs : []);
    } catch (err) {
      log.error("Error fetching daily quests", err);
      setError(err instanceof Error ? err.message : "Failed to fetch daily quests");
    }
  }, [authenticated, selectedWallet?.address]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchDailyQuests();
      setLoading(false);
    };
    if (ready) load();
  }, [ready, fetchDailyQuests]);

  return {
    runs,
    loading,
    error,
    refetch: fetchDailyQuests,
    selectedWallet,
    authenticated,
  };
}

