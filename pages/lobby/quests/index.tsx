import React from "react";
import Head from "next/head";
import { LobbyLayout } from "../../../components/layouts/lobby-layout";
import { SwordIcon } from "../../../components/icons/dashboard-icons";

/**
 * Quests Page - Infernal quests and challenges
 * Route: /lobby/quests
 */
export default function QuestsPage() {
  return (
    <>
      <Head>
        <title>Quests - P2E Inferno</title>
        <meta name="description" content="Infernal quests and challenges" />
      </Head>

      <LobbyLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <SwordIcon size={64} className="mx-auto mb-4 text-magenta-400" />
            <h1 className="text-4xl font-bold mb-2">Infernal Quests</h1>
            <p className="text-faded-grey">
              Embark on legendary challenges and earn your place among the
              infernals
            </p>
          </div>

          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-gradient-to-br from-magenta-800/30 to-magenta-900/30 rounded-xl p-8 border border-magenta-500/20 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-magenta-300">
                Forge Your Legend
              </h2>
              <p className="text-faded-grey mb-6">
                The infernal realm awaits brave souls ready to undertake epic
                quests. Complete challenges, unlock achievements, and rise
                through the ranks of the most elite infernals.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-magenta-400 mb-2">
                    Daily Challenges
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Complete tasks for XP and rewards
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-magenta-400 mb-2">
                    Epic Storylines
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Follow narrative adventures
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-magenta-400 mb-2">
                    Skill Trials
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Test your development abilities
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-magenta-400 mb-2">
                    Guild Missions
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Team up for greater rewards
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
