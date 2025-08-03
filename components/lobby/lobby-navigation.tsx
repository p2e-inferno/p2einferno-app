import React from "react";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { PrivyConnectButton } from "../PrivyConnectButton";
import { NotificationBell } from './NotificationBell'; // Import the new component

/**
 * Navigation component for the infernal lobby
 * Contains branding and authentication controls
 */
export const LobbyNavigation: React.FC = () => {
  return (
    <nav className="relative z-20 flex items-center justify-between p-4 lg:px-8">
      <Link
        href="/lobby"
        className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
      >
        <Gamepad2 className="w-8 h-8 text-flame-yellow" />
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-flame-yellow to-flame-orange bg-clip-text text-transparent">
            P2E Inferno
          </h1>
          <p className="text-xs text-faded-grey">Infernal Lobby</p>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <NotificationBell />
        <PrivyConnectButton />
      </div>
    </nav>
  );
};
