import React from "react";
import Head from "next/head";
import { LobbyLayout } from "../../../components/layouts/lobby-layout";
import { LightningIcon } from "../../../components/icons/dashboard-icons";

/**
 * Events Page - Lightning-fast competitions and community gatherings
 * Route: /lobby/events
 */
export default function EventsPage() {
  return (
    <>
      <Head>
        <title>Events - P2E Inferno</title>
        <meta name="description" content="Infernal events and competitions" />
      </Head>

      <LobbyLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <LightningIcon size={64} className="mx-auto mb-4 text-cyan-400" />
            <h1 className="text-4xl font-bold mb-2">Infernal Events</h1>
            <p className="text-faded-grey">
              Lightning-fast competitions and community gatherings
            </p>
          </div>

          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-gradient-to-br from-cyan-800/30 to-cyan-900/30 rounded-xl p-8 border border-cyan-500/20 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-cyan-300">
                Coming Soon
              </h2>
              <p className="text-faded-grey mb-6">
                Epic events, tournaments, and community challenges are being
                forged in the infernal depths. Stay tuned for legendary
                competitions that will test your mettle and reward your prowess.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">
                    Weekly Tournaments
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Compete against fellow infernals
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">
                    Live Workshops
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Learn from industry experts
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">Hackathons</h3>
                  <p className="text-sm text-faded-grey">
                    Build the future of Web3
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-cyan-400 mb-2">Demo Days</h3>
                  <p className="text-sm text-faded-grey">
                    Showcase your projects
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
