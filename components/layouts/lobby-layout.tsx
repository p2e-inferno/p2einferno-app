import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { BottomDock } from "../dashboard/bottom-dock";
import { LobbyNavigation } from "../lobby/lobby-navigation";
import { LobbyBackground } from "../lobby/lobby-background";
import { LobbyConnectWalletState } from "../lobby/connect-wallet-state";
import Head from "next/head";

interface LobbyLayoutProps {
  children: React.ReactNode;
  title?: string;
}

/**
 * Layout component for all lobby pages
 * Provides consistent authentication checks and UI layout
 */
export const LobbyLayout: React.FC<LobbyLayoutProps> = ({
  children,
  title = "Infernal Lobby - P2E Inferno",
}) => {
  const { ready, authenticated } = usePrivy();

  // Show wallet connection screen if not authenticated
  if (ready && !authenticated) {
    return <LobbyConnectWalletState />;
  }

  // Show loading state while checking auth
  if (!ready) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta
          name="description"
          content="Your gateway to the P2E Inferno metaverse"
        />
      </Head>

      <div
        className="min-h-screen text-white overflow-x-hidden"
        style={{ backgroundColor: "#100F29" }}
      >
        <LobbyBackground />
        <LobbyNavigation />

        {/* Main Content */}
        <main className="relative z-10 px-4 lg:px-8 pb-32">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>

        <BottomDock />
      </div>
    </>
  );
};
