import { User, Trophy, Coins, Target } from "lucide-react";
import { ProfileHeaderProps } from "./types";
import { formatWalletAddress } from "@/lib/utils/wallet-address";

/**
 * ProfileHeader - Displays user profile information and completion stats
 */
export const ProfileHeader = ({
  userAddress,
  completionPercentage,
  profileStats,
}: ProfileHeaderProps) => {
  const { questsCompleted, dgEarned, accountsLinked, totalAccounts } =
    profileStats;

  // Use shared wallet formatter for consistency

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-6 sm:p-8 border border-gray-700 mb-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 mb-6">
        <div className="flex items-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mr-4 sm:mr-6 flex-shrink-0">
            <User className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
              Infernal Profile
            </h1>
            <p className="text-gray-400">
              {userAddress
                ? formatWalletAddress(userAddress)
                : "No wallet connected"}
            </p>
          </div>
        </div>

        {/* Identity Completion Circle */}
        <div className="text-center self-center md:self-auto">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto">
            <svg
              viewBox="0 0 96 96"
              className="block w-full h-full transform -rotate-90"
            >
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-700"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${
                  2 * Math.PI * 40 * (1 - completionPercentage / 100)
                }`}
                className="text-orange-500 transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl sm:text-2xl font-bold text-white">
                {completionPercentage}%
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-2">Identity Complete</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
          <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-xl sm:text-2xl font-bold text-white">
            {questsCompleted}
          </p>
          <p className="text-sm text-gray-400">Quests Completed</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
          <Coins className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-xl sm:text-2xl font-bold text-white">{dgEarned}</p>
          <p className="text-sm text-gray-400">DG Earned</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
          <Target className="w-7 h-7 sm:w-8 sm:h-8 text-orange-400 mx-auto mb-2" />
          <p className="text-xl sm:text-2xl font-bold text-white">
            {accountsLinked}/{totalAccounts}
          </p>
          <p className="text-sm text-gray-400">Accounts Linked</p>
        </div>
      </div>
    </div>
  );
};
