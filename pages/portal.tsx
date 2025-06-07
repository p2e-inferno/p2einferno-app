import React from "react";
import Head from "next/head";
import { LobbyLayout } from "../components/layouts/lobby-layout";
import { PortalIcon } from "../components/icons/dashboard-icons";

export default function PortalPage() {
  return (
    <>
      <Head>
        <title>Portal - P2E Inferno</title>
        <meta name="description" content="Infernal portal to other realms" />
      </Head>

      <LobbyLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <PortalIcon size={64} className="mx-auto mb-4 text-purple-400" />
            <h1 className="text-4xl font-bold mb-2">Infernal Portal</h1>
            <p className="text-faded-grey">Gateway to infinite possibilities</p>
          </div>

          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/30 rounded-xl p-8 border border-purple-500/20 backdrop-blur-sm">
              <h2 className="text-2xl font-bold mb-4 text-purple-300">
                Dimensional Gateway
              </h2>
              <p className="text-faded-grey mb-6">
                Step through the mystical portal to access external tools,
                partnerships, and connections that expand your infernal
                experience beyond the realm.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-purple-400 mb-2">
                    External Tools
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Access partner platforms
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-purple-400 mb-2">
                    Marketplace
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Trade infernal assets
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-purple-400 mb-2">Bridges</h3>
                  <p className="text-sm text-faded-grey">
                    Cross-chain connections
                  </p>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <h3 className="font-bold text-purple-400 mb-2">
                    Partnerships
                  </h3>
                  <p className="text-sm text-faded-grey">
                    Collaborate with allies
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
