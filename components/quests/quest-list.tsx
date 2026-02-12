import { Flame } from "lucide-react";
import { QuestListProps } from "./types";
import { QuestCard } from "./quest-card";

/**
 * QuestList - Main component for displaying a grid of quests
 */
export const QuestList = ({
  quests,
  userProgress,
  completedTasks: _completedTasks,
  loading,
  error,
  getQuestCompletionPercentage,
}: QuestListProps) => {
  // Generate quest data with progress
  const questsWithProgress = quests.map((quest) => {
    const progressPercentage = getQuestCompletionPercentage(quest);
    const questProgressData = userProgress.find((p) => p.quest_id === quest.id);

    // Calculate if any task rewards in this quest are pending
    const questTasksCompletions = _completedTasks.filter(
      (c) => c.quest_id === quest.id,
    );
    const hasPendingTaskRewards = questTasksCompletions.some(
      (c) => c.submission_status === "completed" && !c.reward_claimed,
    );

    const tasksFinished = progressPercentage === 100;
    const keyClaimed = Boolean(questProgressData?.reward_claimed);
    const hasKeyReward = Boolean(quest.lock_address);

    const isQuestKeyPending = tasksFinished && hasKeyReward && !keyClaimed;
    const isCompleted = tasksFinished && (!hasKeyReward || keyClaimed);

    return {
      quest,
      progress: progressPercentage,
      isStarted: !!questProgressData,
      isCompleted,
      hasPendingTaskRewards,
      isQuestKeyPending,
      hasPrerequisite: Boolean(
        quest.prerequisite_quest_id || quest.prerequisite_quest_lock_address,
      ),
    };
  });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Flame className="w-16 h-16 text-orange-500 animate-pulse mx-auto mb-4" />
          <p className="text-xl text-gray-400">Loading quests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center mb-4">
            <Flame className="w-12 h-12 text-orange-500 mr-3" />
            <h1 className="text-4xl font-bold text-white">Infernal Quests</h1>
            <Flame className="w-12 h-12 text-orange-500 ml-3" />
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Embark on your journey through the blazing paths of Web3. Complete
            quests, earn rewards, and forge your identity as a true Infernal.
          </p>
        </div>

        {/* Quest Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {questsWithProgress.map(
            ({
              quest,
              progress: progressPercentage,
              isStarted,
              isCompleted,
              hasPendingTaskRewards,
              isQuestKeyPending,
              hasPrerequisite,
            }) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                progress={progressPercentage}
                isStarted={isStarted}
                isCompleted={isCompleted}
                hasPendingTaskRewards={hasPendingTaskRewards}
                isQuestKeyPending={isQuestKeyPending}
                hasPrerequisite={hasPrerequisite}
              />
            ),
          )}
        </div>

        {/* Empty State */}
        {questsWithProgress.length === 0 && !loading && (
          <div className="text-center py-20">
            <Flame className="w-24 h-24 text-gray-600 mx-auto mb-6" />
            <h3 className="text-2xl text-gray-400 mb-2">No quests available</h3>
            <p className="text-gray-500">Check back soon for new adventures!</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-20">
            <p className="text-red-400 text-xl">
              Error loading quests: {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
