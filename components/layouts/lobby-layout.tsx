import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { BottomDock } from "../dashboard/bottom-dock";
import { LobbyNavigation } from "../lobby/lobby-navigation";

interface LobbyLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout component for all lobby pages
 * Provides consistent authentication checks and UI layout
 */
export const LobbyLayout: React.FC<LobbyLayoutProps> = ({ children }) => {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-indigo-950 to-black text-white pb-32">
      <LobbyNavigation />
      <div className="lg:max-w-[calc(100%-200px)] lg:mx-auto">{children}</div>
      <BottomDock />
    </div>
  );
};
