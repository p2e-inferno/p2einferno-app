import React from "react";
import Head from "next/head";
import { LobbyLayout } from "../../../components/layouts/lobby-layout";
import { CrystalIcon } from "../../../components/icons/dashboard-icons";

/**
 * Bounties Page - Infernal bounties and rewards
 * Route: /lobby/bounties
 */
export default function BountiesPage() {
  return (
    <>
      <Head>
        <title>Bounties - P2E Inferno</title>
        <meta name="description" content="Infernal bounties and rewards" />
      </Head>

      <LobbyLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <CrystalIcon size={64} className="mx-auto mb-4 text-cyan-300" />
            <h1 className="text-4xl font-bold mb-2">Infernal Bounties</h1>
            <p className="text-faded-grey">
              Hunt for legendary rewards and treasures
            </p>
          </div>

          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-gradient-to-br from-cyan-800/30 to-cyan-900/30 rounded-xl p-8 border border-cyan-500/20 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-cyan-200">
                Crystal Hunters Welcome
              </h2>
              <p className="text-faded-grey mb-6">
                The most lucrative opportunities await skilled infernals.
                Complete bounties, collect rare crystals, and claim your
                rightful rewards.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">
                    Code Bounties
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Fix bugs and earn crystals
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">
                    Research Tasks
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Investigate new technologies
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">
                    Community Rewards
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Help fellow infernals
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">
                    Special Missions
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Exclusive high-value tasks
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
