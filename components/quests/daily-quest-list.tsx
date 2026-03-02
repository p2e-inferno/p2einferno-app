import { Flame } from "lucide-react";
import type { DailyQuestRunListItem } from "@/hooks/useDailyQuests";
import { DailyQuestCard } from "@/components/quests/daily-quest-card";

export function DailyQuestList(props: {
  runs: DailyQuestRunListItem[];
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  activeWalletAddress?: string | null;
  onStarted?: () => void;
}) {
  const {
    runs,
    loading,
    error,
    authenticated,
    activeWalletAddress,
    onStarted,
  } = props;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Flame className="w-16 h-16 text-orange-500 animate-pulse mx-auto mb-4" />
          <p className="text-xl text-gray-400">Loading daily quests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center mb-4">
            <Flame className="w-12 h-12 text-orange-500 mr-3" />
            <h1 className="text-4xl font-bold text-white">Daily Quests</h1>
            <Flame className="w-12 h-12 text-orange-500 ml-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {runs.map((run) => (
            <DailyQuestCard
              key={run.id}
              run={run}
              authenticated={authenticated}
              activeWalletAddress={activeWalletAddress}
              onStarted={onStarted}
            />
          ))}
        </div>

        {runs.length === 0 && !loading && (
          <div className="text-center py-20">
            <Flame className="w-24 h-24 text-gray-600 mx-auto mb-6" />
            <h3 className="text-2xl text-gray-400 mb-2">
              No daily quests available
            </h3>
            <p className="text-gray-500">
              Check back tomorrow after UTC reset.
            </p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 text-xl">
              Error loading daily quests: {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
