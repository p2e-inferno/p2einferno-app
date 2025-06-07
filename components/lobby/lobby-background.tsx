import React from "react";

/**
 * Background effects component for the infernal lobby
 * Provides animated gradient orbs for visual ambiance
 */
export const LobbyBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-magenta-600/5 rounded-full blur-3xl animate-pulse" />
    </div>
  );
};
