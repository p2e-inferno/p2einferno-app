import Link from "next/link";
import Image from "next/image";
import { Coins, ChevronRight, Sparkles } from "lucide-react";
import { QuestCardProps } from "./types";
import { RichText } from "@/components/common/RichText";

/**
 * QuestCard - Individual quest display card for the quest list
 */
export const QuestCard = ({
  quest,
  progress,
  isStarted,
  isCompleted,
  hasPendingTaskRewards,
  isQuestKeyPending,
  hasPrerequisite,
  requiresGoodDollar,
}: QuestCardProps) => {
  return (
    <Link href={`/lobby/quests/${quest.id}`} className="group relative">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-orange-500 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/20">
        {/* Quest Image */}
        <div className="relative h-48 mb-6 rounded-lg overflow-hidden bg-gradient-to-br from-orange-900/20 to-red-900/20">
          <div className="w-full h-full flex items-center justify-center">
            <Image
              src={quest.image_url || "/images/quests/rosy-beginnings.svg"}
              alt={quest.title}
              width={192}
              height={192}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Status Badges */}
          <div className="absolute top-2 right-2 flex flex-col gap-2 items-end">
            {isCompleted && (
              <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center shadow-lg shadow-green-500/20">
                <Sparkles className="w-4 h-4 mr-1" />
                Completed
              </div>
            )}
            {isQuestKeyPending && (
              <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center animate-pulse shadow-lg shadow-blue-500/20">
                <ChevronRight className="w-4 h-4 mr-1" />
                Claim Key
              </div>
            )}
            {hasPendingTaskRewards && (
              <div className="bg-cyan-500 text-white px-3 py-1 rounded-full text-sm font-semibold flex items-center animate-pulse shadow-lg shadow-cyan-500/20">
                <Coins className="w-4 h-4 mr-1" />
                Claim Reward
              </div>
            )}
            {isStarted && !isCompleted && !isQuestKeyPending && (
              <div className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg shadow-orange-500/20">
                In Progress
              </div>
            )}
            {!isStarted && !isCompleted && (
              <div className="bg-gray-600 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
                New Quest
              </div>
            )}
            {hasPrerequisite && (
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-600 text-gray-300 px-3 py-1 rounded-full text-xs font-medium">
                Prerequisite Required
              </div>
            )}
            {requiresGoodDollar && (
              <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-600 text-gray-300 px-3 py-1 rounded-full text-xs font-medium">
                GoodDollar Verification Required
              </div>
            )}
          </div>
        </div>

        {/* Quest Info */}
        <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-orange-400 transition-colors">
          {quest.title}
        </h3>

        <RichText
          content={quest.description}
          className="text-gray-400 mb-4 line-clamp-2"
        />

        {/* Progress Bar */}
        {isStarted && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Progress</span>
              <span className="text-orange-400 font-semibold">{progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-500 to-red-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Rewards */}
        <div className="flex items-center justify-between">
          <div className="flex items-center text-yellow-400">
            <Coins className="w-5 h-5 mr-2" />
            <span className="font-bold text-lg">{quest.total_reward} DG</span>
          </div>

          <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-orange-400 transform group-hover:translate-x-1 transition-all" />
        </div>

        {/* Flame effect on hover */}
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-t from-orange-500/10 via-transparent to-transparent rounded-xl" />
        </div>
      </div>
    </Link>
  );
};
