import { User, Trophy, Coins, Target } from "lucide-react";
import { ProfileHeaderProps } from "./types";

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

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4,
    )}`;
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mr-6">
            <User className="w-12 h-12 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Infernal Profile
            </h1>
            <p className="text-gray-400">
              {userAddress ? formatAddress(userAddress) : "No wallet connected"}
            </p>
          </div>
        </div>

        {/* Identity Completion Circle */}
        <div className="text-center">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90">
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
              <span className="text-2xl font-bold text-white">
                {completionPercentage}%
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-2">Identity Complete</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-4 text-center">
          <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{questsCompleted}</p>
          <p className="text-sm text-gray-400">Quests Completed</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 text-center">
          <Coins className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{dgEarned}</p>
          <p className="text-sm text-gray-400">DG Earned</p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 text-center">
          <Target className="w-8 h-8 text-orange-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">
            {accountsLinked}/{totalAccounts}
          </p>
          <p className="text-sm text-gray-400">Accounts Linked</p>
        </div>
      </div>
    </div>
  );
};
