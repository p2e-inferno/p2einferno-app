import React from "react";
import Image from "next/image";
import { Flame, Coins, Sparkles } from "lucide-react"; // Icons used in the header

// Define types for the props expected by QuestHeader
// These might need to be aligned/imported from a shared types file if one exists for quests
interface QuestData {
  title: string;
  description: string;
  image_url?: string | null;
  total_reward: number;
  // Add any other quest-specific fields needed for the header
}

interface QuestHeaderProps {
  quest: QuestData;
  progressPercentage: number; // Calculated progress (0-100)
  isQuestCompleted: boolean;
  isQuestStarted: boolean; // To control the "Start Quest" button visibility or state
  tasksCompletedCount: number;
  totalTasksCount: number;
  onStartQuest?: () => void; // Optional: if the start button is part of this header
  isLoadingStartQuest?: boolean; // Optional: for loading state of start button
}

const QuestHeader: React.FC<QuestHeaderProps> = ({
  quest,
  progressPercentage,
  isQuestCompleted,
  isQuestStarted,
  tasksCompletedCount,
  totalTasksCount,
  onStartQuest,
  isLoadingStartQuest,
}) => {
  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-6 sm:p-8 border border-gray-700 mb-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4 flex items-center break-words">
            {quest.title}
            {isQuestCompleted && (
              <Sparkles className="w-8 h-8 text-green-500 ml-3" />
            )}
          </h1>
          <p className="text-base sm:text-lg text-gray-400 leading-relaxed break-words">
            {quest.description}
          </p>
        </div>

        <div className="md:ml-8 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-lg overflow-hidden bg-gradient-to-br from-orange-900/20 to-red-900/20 flex-shrink-0 self-start md:self-auto mt-2 md:mt-0">
          {quest.image_url ? (
            <Image
              src={quest.image_url}
              alt={quest.title}
              width={128}
              height={128}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Flame className="w-16 h-16 text-orange-500/50" />
            </div>
          )}
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <span className="text-gray-400">Quest Progress</span>
          <span className="text-xl sm:text-2xl font-bold text-orange-400">
            {progressPercentage}%
          </span>
        </div>

        <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
          <div
            className="bg-gradient-to-r from-orange-500 to-red-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
            aria-valuenow={progressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            role="progressbar"
            aria-label="Quest progress"
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
          <div className="text-gray-400">
            {tasksCompletedCount} of {totalTasksCount} tasks completed
          </div>
          <div className="flex items-center text-yellow-400">
            <Coins className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
            <span className="font-bold text-lg sm:text-xl">
              {quest.total_reward} DG Total
            </span>
          </div>
        </div>
      </div>

      {/* Start Quest Button - Conditionally rendered if onStartQuest is provided */}
      {onStartQuest && !isQuestStarted && (
        <button
          onClick={onStartQuest}
          disabled={isLoadingStartQuest}
          className="mt-6 w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-3 sm:py-4 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {isLoadingStartQuest ? "Starting..." : "Start Quest"}
        </button>
      )}
    </div>
  );
};

export default QuestHeader;
