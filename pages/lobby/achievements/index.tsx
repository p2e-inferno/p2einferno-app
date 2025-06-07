import React from "react";
import Head from "next/head";
import { LobbyLayout } from "../../../components/layouts/lobby-layout";
import { TrophyIcon } from "../../../components/icons/dashboard-icons";

/**
 * Achievements Page - Infernal achievements and accolades
 * Route: /lobby/achievements
 */
export default function AchievementsPage() {
  return (
    <>
      <Head>
        <title>Achievements - P2E Inferno</title>
        <meta
          name="description"
          content="Infernal achievements and accolades"
        />
      </Head>

      <LobbyLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <TrophyIcon size={64} className="mx-auto mb-4 text-yellow-400" />
            <h1 className="text-4xl font-bold mb-2">Infernal Achievements</h1>
            <p className="text-faded-grey">
              Showcase your legendary accomplishments and earned accolades
            </p>
          </div>

          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-gradient-to-br from-yellow-800/30 to-yellow-900/30 rounded-xl p-8 border border-yellow-500/20 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-yellow-300">
                Hall of Glory
              </h2>
              <p className="text-faded-grey mb-6">
                Every victory, every milestone, every legendary moment is
                immortalized here. Build your legacy and let your achievements
                speak for your prowess in the infernal realm.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-yellow-400 mb-2">
                    Bootcamp Mastery
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Complete training programs
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-yellow-400 mb-2">
                    Quest Champion
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Conquer epic challenges
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-yellow-400 mb-2">
                    Crystal Collector
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Gather rare treasures
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-yellow-400 mb-2">
                    Infernal Legend
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Reach the highest ranks
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </LobbyLayout>
    </>
  );
}
