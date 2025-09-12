import { Trophy, Award, Star, Medal } from "lucide-react";

/**
 * AchievementsPage - Component for displaying user achievements
 */
export const AchievementsPage = () => {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Trophy className="w-12 h-12 text-orange-500 mr-3" />
            <h1 className="text-4xl font-bold text-white">
              Infernal Achievements
            </h1>
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Track your progress and showcase your accomplishments in the
            Infernal realm.
          </p>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700 text-center">
          <Trophy className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">
            Achievement System Coming Soon
          </h2>
          <p className="text-gray-400 mb-6">
            We&apos;re crafting a comprehensive achievement system to recognize
            and reward your dedication and skills in the Web3 space.
          </p>

          {/* Feature Preview */}
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Award className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Skill Badges
              </h3>
              <p className="text-sm text-gray-400">
                Earn badges for mastering different Web3 technologies
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Star className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Progress Tracking
              </h3>
              <p className="text-sm text-gray-400">
                Monitor your journey through quests and learning paths
              </p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <Medal className="w-8 h-8 text-orange-500 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Leaderboards
              </h3>
              <p className="text-sm text-gray-400">
                Compete with fellow Infernals and climb the rankings
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
