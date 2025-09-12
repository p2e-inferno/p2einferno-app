import { Target, Coins, Shield, Zap } from "lucide-react";

/**
 * BountiesPage - Component for displaying available bounties
 */
export const BountiesPage = () => {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Target className="w-12 h-12 text-orange-500 mr-3" />
            <h1 className="text-4xl font-bold text-white">Infernal Bounties</h1>
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Take on challenging tasks and earn substantial rewards for your
            contributions to the ecosystem.
          </p>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700 text-center">
          <Target className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">
            Bounty System Coming Soon
          </h2>
          <p className="text-gray-400 mb-6">
            We&apos;re developing a comprehensive bounty system where you can
            tackle real-world challenges and earn significant DG token rewards.
          </p>

          {/* Feature Preview */}
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Coins className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                High Rewards
              </h3>
              <p className="text-sm text-gray-400">
                Earn substantial DG tokens for completing complex bounties
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Shield className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Verified Tasks
              </h3>
              <p className="text-sm text-gray-400">
                All bounties are verified and approved by the community
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Zap className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Skill Building
              </h3>
              <p className="text-sm text-gray-400">
                Develop real-world Web3 skills through practical challenges
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
