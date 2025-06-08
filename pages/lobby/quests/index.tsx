import { LobbyLayout } from "@/components/layouts/lobby-layout";
import { useQuests } from "@/hooks/useQuests";
import { QuestList } from "@/components/quests";

/**
 * QuestsPage - Main page for displaying available quests
 * Fetches and displays all active quests with user progress
 */
const QuestsPage = () => {
  const {
    quests,
    userProgress,
    completedTasks,
    loading,
    error,
    getQuestCompletionPercentage,
  } = useQuests();

  return (
    <LobbyLayout>
      <QuestList
        quests={quests}
        userProgress={userProgress}
        completedTasks={completedTasks}
        loading={loading}
        error={error}
        getQuestCompletionPercentage={getQuestCompletionPercentage}
      />
    </LobbyLayout>
  );
};

export default QuestsPage;
