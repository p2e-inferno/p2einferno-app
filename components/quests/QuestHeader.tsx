import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Coins, Sparkles } from "lucide-react";
import type { QuestHeaderProps } from "./types";
import { RichText } from "@/components/common/RichText";

const QuestHeader: React.FC<QuestHeaderProps> = ({
  quest,
  progressPercentage,
  isQuestCompleted,
  isQuestStarted,
  tasksCompletedCount,
  totalTasksCount,
  onStartQuest,
  isLoadingStartQuest,
  canStartQuest = true,
  prerequisiteQuest,
  canClaimReward,
  hasClaimedReward,
  onClaimReward,
  isClaimingReward,
  isQuestKeyPending,
  prerequisiteState,
}) => {
  const rewardLabel =
    quest.reward_type === "activation"
      ? hasClaimedReward
        ? "Trial Claimed"
        : isQuestKeyPending
          ? "Claim Trial Access"
          : "Trial Ready"
      : hasClaimedReward
        ? "Quest Completed"
        : isQuestKeyPending
          ? "Claim Quest Key"
          : "Complete Quest";
  const startDisabled =
    !isQuestStarted && (!canStartQuest || Boolean(isLoadingStartQuest));
  const startButtonLabel = !canStartQuest
    ? prerequisiteState === "missing_verification"
      ? "GoodDollar Verification Required"
      : "Prerequisites Required"
    : isLoadingStartQuest
      ? "Starting..."
      : "Start Quest";

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl overflow-hidden border border-gray-700 mb-8">
      {quest.image_url && (
        <div className="relative w-full h-48 sm:h-56 md:h-64">
          <Image
            src={quest.image_url}
            alt={quest.title}
            fill
            className="object-cover"
            priority
          />
        </div>
      )}

      <div className="p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4 flex items-center break-words">
            {quest.title}
            {isQuestCompleted && (
              <Sparkles className="w-8 h-8 text-green-500 ml-3" />
            )}
          </h1>
          <RichText
            content={quest.description}
            className="text-base sm:text-lg text-gray-400 leading-relaxed break-words"
          />
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
            disabled={startDisabled}
            className="mt-6 w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-3 sm:py-4 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {startButtonLabel}
          </button>
        )}
        {onStartQuest && !isQuestStarted && !canStartQuest && (
          <p className="mt-2 text-sm text-yellow-400">
            {prerequisiteQuest ? (
              <>
                Complete{" "}
                <Link
                  href={`/lobby/quests/${prerequisiteQuest.id}`}
                  className="underline hover:text-yellow-300 transition-colors"
                >
                  {prerequisiteQuest.title}
                </Link>{" "}
                before starting this quest.
              </>
            ) : (
              "Complete the prerequisite quest before starting."
            )}
          </p>
        )}

        {onClaimReward && (isQuestCompleted || isQuestKeyPending) && (
          <button
            onClick={onClaimReward}
            disabled={Boolean(
              isClaimingReward || hasClaimedReward || !canClaimReward,
            )}
            className="mt-4 w-full border border-green-500 text-green-300 font-semibold py-3 sm:py-4 px-6 rounded-lg hover:bg-green-500/10 transition-all duration-300 disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isClaimingReward ? "Claiming..." : rewardLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default QuestHeader;
