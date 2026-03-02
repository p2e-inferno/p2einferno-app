import { LobbyLayout } from "@/components/layouts/lobby-layout";
import { useQuests } from "@/hooks/useQuests";
import { QuestList, DailyQuestList } from "@/components/quests";
import { useDailyQuests } from "@/hooks/useDailyQuests";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRouter } from "next/router";

/**
 * QuestsPage - Main page for displaying available quests
 * Fetches and displays all active quests with user progress
 */
const QuestsPage = () => {
  const router = useRouter();
  const tab =
    typeof router.query.tab === "string" ? router.query.tab : "quests";
  const activeTab = tab === "daily" ? "daily" : "quests";
  const {
    quests,
    userProgress,
    completedTasks,
    loading,
    error,
    getQuestCompletionPercentage,
  } = useQuests();

  const {
    runs,
    loading: dailyLoading,
    error: dailyError,
    refetch: refetchDaily,
    authenticated,
    selectedWallet,
  } = useDailyQuests();

  return (
    <LobbyLayout>
      <div className="p-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            router.replace(`/lobby/quests?tab=${v}`, undefined, {
              shallow: true,
            })
          }
        >
          <TabsList className="mb-4">
            <TabsTrigger value="quests">Quests</TabsTrigger>
            <TabsTrigger value="daily">Daily Quests</TabsTrigger>
          </TabsList>

          <TabsContent value="quests">
            <QuestList
              quests={quests}
              userProgress={userProgress}
              completedTasks={completedTasks}
              loading={loading}
              error={error}
              getQuestCompletionPercentage={getQuestCompletionPercentage}
            />
          </TabsContent>

          <TabsContent value="daily">
            <DailyQuestList
              runs={runs}
              loading={dailyLoading}
              error={dailyError}
              authenticated={authenticated}
              activeWalletAddress={selectedWallet?.address || null}
              onStarted={refetchDaily}
            />
          </TabsContent>
        </Tabs>
      </div>
    </LobbyLayout>
  );
};

export default QuestsPage;
