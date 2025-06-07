import React from "react";
import { FlameIcon } from "../icons/dashboard-icons";
import { PrivyConnectButton } from "../PrivyConnectButton";

/**
 * Navigation component for the infernal lobby
 * Contains branding and authentication controls
 */
export const LobbyNavigation: React.FC = () => {
  return (
    <nav className="relative z-10 flex items-center justify-between p-4 lg:px-8">
      <div className="flex items-center space-x-3">
        <FlameIcon size={32} className="text-flame-yellow" />
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-flame-yellow to-flame-orange bg-clip-text text-transparent">
            P2E Inferno
          </h1>
          <p className="text-xs text-faded-grey">Infernal Lobby</p>
        </div>
      </div>

      <div className="flex items-center">
        <PrivyConnectButton />
      </div>
    </nav>
  );
};
